from __future__ import annotations

import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import APIError
from app.models.session import ResourceType, Session as ClassSession, SessionResource
from app.models.user import User
from app.models.video import Video, VideoRendition, VideoStatus


def _media_root() -> Path:
    p = Path(settings.MEDIA_DIR)
    (p / "originals").mkdir(parents=True, exist_ok=True)
    (p / "videos").mkdir(parents=True, exist_ok=True)
    return p


async def save_video_upload(file: UploadFile, uploader: User) -> tuple[str, int, str]:
    """Stream the upload to /app/media/originals/<uuid>.<ext>, enforcing MAX_VIDEO_MB.

    Returns (absolute_path, size_bytes, original_filename).
    Raises APIError(413) on size cap exceed; deletes partial file.
    """
    cap = settings.MAX_VIDEO_MB * 1024 * 1024
    media = _media_root()

    original_filename = file.filename or "video.mp4"
    ext = ""
    if "." in original_filename:
        ext = "." + original_filename.rsplit(".", 1)[-1].lower()
    if not ext:
        ext = ".mp4"

    # Namespace raw uploads per instructor so each owner's files are grouped together.
    originals_dir = media / "originals" / str(uploader.id)
    originals_dir.mkdir(parents=True, exist_ok=True)
    fname = f"{uuid.uuid4().hex}{ext}"
    abs_path = originals_dir / fname

    total = 0
    try:
        async with aiofiles.open(abs_path, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > cap:
                    raise APIError(
                        code="FILE_TOO_LARGE",
                        message=f"Video upload is limited to {settings.MAX_VIDEO_MB} MB.",
                        status_code=413,
                    )
                await out.write(chunk)
    except APIError:
        try:
            os.unlink(abs_path)
        except FileNotFoundError:
            pass
        raise
    except Exception:
        try:
            os.unlink(abs_path)
        except FileNotFoundError:
            pass
        raise

    print(f"[VIDEO] Saved upload to {abs_path} ({total} bytes)")
    return str(abs_path), total, original_filename


async def create_video_with_resource(
    db: AsyncSession,
    *,
    session_id: str,
    title: str,
    source_abs_path: str,
    original_filename: str,
    size_bytes: int,
    uploader: User,
) -> Video:
    """Create the SessionResource sentinel + Video row in a single transaction."""
    session_obj = await db.get(ClassSession, session_id)
    if not session_obj:
        raise APIError(code="NOT_FOUND", message="Session not found", status_code=404)

    video_id = uuid.uuid4()
    resource = SessionResource(
        session_id=session_obj.id,
        title=title.strip() or original_filename,
        resource_type=ResourceType.video,
        url=f"video://{video_id}",
    )
    db.add(resource)
    await db.flush()

    video = Video(
        id=video_id,
        session_resource_id=resource.id,
        uploaded_by=uploader.id,
        original_filename=original_filename,
        original_size_bytes=size_bytes,
        source_path=source_abs_path,
        status=VideoStatus.uploaded,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)
    return video


async def get_video_by_id(db: AsyncSession, video_id: str) -> Optional[Video]:
    return await db.get(Video, video_id)


async def get_video_by_resource_url(db: AsyncSession, url: str) -> Optional[Video]:
    """Resolve 'video://<uuid>' back to the Video row."""
    if not url.startswith("video://"):
        return None
    try:
        vid = uuid.UUID(url.removeprefix("video://"))
    except ValueError:
        return None
    return await db.get(Video, vid)


async def delete_video(db: AsyncSession, video: Video) -> None:
    """Delete on-disk artifacts (source + HLS) and remove the DB row + linked SessionResource."""
    # Remove HLS tree
    if video.hls_dir:
        try:
            from shutil import rmtree
            rmtree(video.hls_dir, ignore_errors=True)
        except Exception as exc:
            print(f"[VIDEO] Failed to rmtree {video.hls_dir}: {exc}")
    # Remove original
    if video.source_path:
        try:
            os.unlink(video.source_path)
        except FileNotFoundError:
            pass
        except Exception as exc:
            print(f"[VIDEO] Failed to unlink {video.source_path}: {exc}")

    # Cascade deletes the SessionResource via FK; explicitly delete to be safe.
    if video.session_resource_id:
        res = await db.get(SessionResource, video.session_resource_id)
        if res:
            await db.delete(res)
    await db.delete(video)
    await db.commit()


async def reset_for_retry(db: AsyncSession, video: Video) -> Video:
    """Flip a failed video back to 'queued' so the nightly task picks it up.

    Requires the original source file to still be on disk (we delete it after
    a successful encode). If the source is gone, raises a friendly error.
    """
    if not video.source_path or not os.path.isfile(video.source_path):
        raise APIError(
            code="VIDEO_SOURCE_MISSING",
            message="The original upload is no longer available — re-upload to retry.",
            status_code=400,
        )
    video.status = VideoStatus.queued
    video.error_message = None
    await db.commit()
    await db.refresh(video)
    return video


def hls_root_for(instructor_id: str, video_id: str) -> Path:
    """HLS output dir, namespaced per instructor: media/videos/<instructor_id>/<video_id>."""
    return _media_root() / "videos" / str(instructor_id) / str(video_id)
