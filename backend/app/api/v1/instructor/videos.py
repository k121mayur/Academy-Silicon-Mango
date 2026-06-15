from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError
from app.db.session import get_db
from app.dependencies.auth import require_instructor
from app.models.batch import Batch, DeliveryMode
from app.models.session import Session as ClassSession
from app.models.user import User
from app.models.video import Video, VideoStatus
from app.services import video_service as vs

router = APIRouter(prefix="/instructor", tags=["instructor:videos"])


async def _assert_session_owned_by_instructor(db: AsyncSession, instructor: User, session_id: str) -> ClassSession:
    session = await db.get(ClassSession, session_id)
    if not session:
        raise APIError(code="NOT_FOUND", message="Session not found", status_code=404)
    batch = await db.get(Batch, session.batch_id)
    if not batch:
        raise APIError(code="NOT_FOUND", message="Parent batch not found", status_code=404)
    if batch.instructor_id != instructor.id:
        raise APIError(code="FORBIDDEN", message="Not your batch", status_code=403)
    if batch.delivery_mode != DeliveryMode.recorded:
        raise APIError(
            code="VIDEO_LIVE_BATCH",
            message="Video uploads are only available for self-paced (recorded) batches.",
            status_code=400,
        )
    return session


def _video_dto(v: Video) -> dict:
    return {
        "id": str(v.id),
        "session_resource_id": str(v.session_resource_id),
        "original_filename": v.original_filename,
        "original_size_bytes": v.original_size_bytes,
        "duration_seconds": v.duration_seconds,
        "source_height": v.source_height,
        "status": v.status.value,
        "error_message": v.error_message,
        "processed_at": v.processed_at.isoformat() if v.processed_at else None,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


@router.post("/sessions/{session_id}/videos")
async def upload_video(
    session_id: str,
    title: str = Form(...),
    file: UploadFile = File(...),
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Multipart upload of one video (≤ MAX_VIDEO_MB)."""
    session = await _assert_session_owned_by_instructor(db, instructor, session_id)

    # Sanity: ensure content-type looks like video. (Browsers usually set this; if absent we still accept.)
    if file.content_type and not file.content_type.startswith("video/"):
        raise APIError(
            code="NOT_A_VIDEO",
            message=f"Expected video/* upload, got {file.content_type}",
            status_code=400,
        )

    abs_path, size_bytes, original_filename = await vs.save_video_upload(file, instructor)
    video = await vs.create_video_with_resource(
        db,
        session_id=str(session.id),
        title=title,
        source_abs_path=abs_path,
        original_filename=original_filename,
        size_bytes=size_bytes,
        uploader=instructor,
    )
    # Compression is deliberately deferred to the nightly midnight batch to keep
    # daytime server load low — it is NOT triggered on upload.
    return {
        "success": True,
        "data": {
            **_video_dto(video),
            "message": "Uploaded. The lesson is optimized to 720p in tonight's midnight batch and becomes playable once that completes.",
        },
    }


@router.get("/videos/{video_id}")
async def get_video(
    video_id: str,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    video = await vs.get_video_by_id(db, video_id)
    if not video:
        raise APIError(code="NOT_FOUND", message="Video not found", status_code=404)
    # Authorize by walking back to the batch instructor
    if video.uploaded_by != instructor.id:
        # Allow assigned instructor of the batch too
        from app.models.session import SessionResource as SR
        sr = await db.get(SR, video.session_resource_id)
        if sr:
            sess = await db.get(ClassSession, sr.session_id)
            if sess:
                batch = await db.get(Batch, sess.batch_id)
                if not batch or batch.instructor_id != instructor.id:
                    raise APIError(code="FORBIDDEN", message="Not your video", status_code=403)
            else:
                raise APIError(code="FORBIDDEN", message="Not your video", status_code=403)
        else:
            raise APIError(code="FORBIDDEN", message="Not your video", status_code=403)
    return {"success": True, "data": _video_dto(video)}


@router.delete("/videos/{video_id}")
async def delete_video(
    video_id: str,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    video = await vs.get_video_by_id(db, video_id)
    if not video:
        raise APIError(code="NOT_FOUND", message="Video not found", status_code=404)
    if video.uploaded_by != instructor.id:
        from app.models.session import SessionResource as SR
        sr = await db.get(SR, video.session_resource_id)
        if sr:
            sess = await db.get(ClassSession, sr.session_id)
            if not sess:
                raise APIError(code="FORBIDDEN", message="Not your video", status_code=403)
            batch = await db.get(Batch, sess.batch_id)
            if not batch or batch.instructor_id != instructor.id:
                raise APIError(code="FORBIDDEN", message="Not your video", status_code=403)
    await vs.delete_video(db, video)
    return {"success": True, "message": "Deleted"}


@router.post("/videos/{video_id}/retry")
async def retry_video(
    video_id: str,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    video = await vs.get_video_by_id(db, video_id)
    if not video:
        raise APIError(code="NOT_FOUND", message="Video not found", status_code=404)
    if video.uploaded_by != instructor.id:
        raise APIError(code="FORBIDDEN", message="Not your video", status_code=403)
    if video.status != VideoStatus.failed:
        raise APIError(
            code="VIDEO_NOT_FAILED",
            message=f"Only failed videos can be retried (current status: {video.status.value}).",
            status_code=400,
        )
    # Re-queue for the nightly midnight batch (no instant re-encode).
    video = await vs.reset_for_retry(db, video)
    return {"success": True, "data": _video_dto(video)}
