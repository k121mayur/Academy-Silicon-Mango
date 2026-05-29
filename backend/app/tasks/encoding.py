from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.celery_app import celery
from app.core.config import settings
from app.models.video import Video, VideoRendition, VideoStatus
from app.services import ffmpeg_service as ff
from app.services.video_service import hls_root_for


def _make_session_factory():
    """Create a fresh async engine + session factory.

    Must be called INSIDE asyncio.run() so the engine is bound to the
    current event loop — not the one from the parent process that forked
    this Celery worker.
    """
    engine = create_async_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=2,
    )
    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    return engine, factory


@celery.task(name="tasks.optimize_pending_videos", bind=True, max_retries=2, default_retry_delay=600)
def optimize_pending_videos(self) -> dict:
    """Process all pending videos sequentially. Triggered nightly by Celery Beat."""
    try:
        return asyncio.run(_run())
    except Exception as exc:
        raise self.retry(exc=exc)


async def _run() -> dict:
    # Fresh engine bound to THIS event loop — no cross-loop contamination from fork.
    engine, Session = _make_session_factory()
    processed = 0
    succeeded = 0
    failed = 0
    try:
        while True:
            picked: Optional[Video] = None
            async with Session() as db:
                picked = await _pick_next(db)
                if picked is None:
                    break
                picked.status = VideoStatus.processing
                picked.error_message = None
                await db.commit()
                await db.refresh(picked)

            processed += 1
            ok, err = await _encode_one(picked.id, Session)
            if ok:
                succeeded += 1
            else:
                failed += 1
                async with Session() as db:
                    v = await db.get(Video, picked.id)
                    if v is not None:
                        v.status = VideoStatus.failed
                        v.error_message = (err or "Unknown error")[:1500]
                        await db.commit()
    finally:
        await engine.dispose()

    print(f"[ENCODING] Nightly run done — processed={processed} ok={succeeded} fail={failed}")
    return {"processed": processed, "succeeded": succeeded, "failed": failed}


async def _pick_next(db: AsyncSession) -> Optional[Video]:
    cutoff = datetime.utcnow() - timedelta(hours=1)
    stmt = (
        select(Video)
        .where(
            or_(
                Video.status.in_([VideoStatus.uploaded, VideoStatus.queued]),
                (Video.status == VideoStatus.processing) & (Video.updated_at < cutoff),
            )
        )
        .order_by(Video.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    res = await db.execute(stmt)
    return res.scalars().first()


async def _encode_one(video_id, Session: async_sessionmaker) -> tuple[bool, Optional[str]]:
    """Encode one video. Returns (ok, error_msg). Marks status in DB on success."""
    try:
        async with Session() as db:
            video = await db.get(Video, video_id)
            if video is None:
                return False, "Video row vanished"
            if not video.source_path or not os.path.isfile(video.source_path):
                return False, "Source file missing"
            src_path = video.source_path

        if not ff.ffmpeg_available():
            return False, "ffmpeg/ffprobe not installed in worker"

        try:
            probe = ff.ffprobe(src_path)
        except Exception as exc:
            return False, f"ffprobe failed: {exc}"
        if not probe.has_video:
            return False, "No video stream in upload"

        renditions = ff.renditions_for(probe.height)
        out_dir = hls_root_for(str(video_id))
        out_dir.mkdir(parents=True, exist_ok=True)

        try:
            ff.run_encode(src_path, str(out_dir), renditions)
        except Exception as exc:
            return False, f"ffmpeg failed: {exc}"

        master = out_dir / "master.m3u8"
        if not master.is_file():
            return False, "ffmpeg exited 0 but master.m3u8 missing"

        async with Session() as db:
            video = await db.get(Video, video_id)
            if video is None:
                return False, "Video row vanished after encode"
            # Load renditions relationship explicitly (avoids lazy-load on async session)
            from sqlalchemy import select as sa_select
            from app.models.video import VideoRendition as VR
            existing = (await db.execute(sa_select(VR).where(VR.video_id == video.id))).scalars().all()
            for old in existing:
                await db.delete(old)
            await db.flush()
            for r in renditions:
                db.add(VideoRendition(
                    id=uuid.uuid4(),
                    video_id=video.id,
                    name=r.name,
                    height=r.height,
                    bitrate_kbps=r.bitrate_kbps,
                    playlist_path=f"{r.name}/index.m3u8",
                ))
            video.hls_dir = str(out_dir)
            video.duration_seconds = probe.duration_seconds
            video.source_height = probe.height
            video.status = VideoStatus.ready
            video.processed_at = datetime.utcnow()
            video.error_message = None
            if video.source_path and os.path.isfile(video.source_path):
                try:
                    os.unlink(video.source_path)
                    video.source_path = None
                except Exception as exc:
                    print(f"[ENCODING] Failed to delete source {video.source_path}: {exc}")
            await db.commit()

        print(f"[ENCODING] video={video_id} OK — renditions={[r.name for r in renditions]} duration={probe.duration_seconds}s")
        return True, None
    except Exception as exc:
        return False, f"unexpected: {exc}"
