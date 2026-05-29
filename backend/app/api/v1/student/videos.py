from __future__ import annotations

import os
import re
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import APIError
from app.core.redis import get_redis
from app.db.session import get_db
from app.dependencies.auth import require_student
from app.models.batch import Enrollment
from app.models.session import Session as ClassSession, SessionResource
from app.models.user import StudentProfile, User
from app.models.video import Video, VideoStatus
from app.services import stream_token_service as tok
from app.services.ffmpeg_service import safe_playlist_path, safe_segment_path

router = APIRouter(prefix="/student/videos", tags=["student:videos"])


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


async def _resolve_video_for_student(db: AsyncSession, student: User, video_id: str) -> tuple[Video, str]:
    """Verify enrollment + return (video, batch_id_str). Raises 403/404 on mismatch."""
    video = await db.get(Video, video_id)
    if not video:
        raise APIError(code="NOT_FOUND", message="Video not found", status_code=404)
    resource = await db.get(SessionResource, video.session_resource_id)
    if not resource:
        raise APIError(code="NOT_FOUND", message="Linked resource missing", status_code=404)
    session = await db.get(ClassSession, resource.session_id)
    if not session:
        raise APIError(code="NOT_FOUND", message="Linked session missing", status_code=404)
    enr = (
        await db.execute(
            select(Enrollment).where(
                Enrollment.batch_id == session.batch_id,
                Enrollment.student_id == student.id,
            )
        )
    ).scalar_one_or_none()
    if not enr:
        raise APIError(code="FORBIDDEN", message="Not enrolled in this batch", status_code=403)
    return video, str(session.batch_id)


async def _check_not_revoked(student_id: str, batch_id: str) -> None:
    r = await get_redis()
    key = f"stream:revoked:{student_id}:{batch_id}"
    if await r.exists(key):
        raise APIError(code="STREAM_REVOKED", message="Access revoked", status_code=403)


@router.get("/{video_id}/playback-info")
async def playback_info(
    video_id: str,
    request: Request,
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    video, batch_id = await _resolve_video_for_student(db, student, video_id)
    await _check_not_revoked(str(student.id), batch_id)

    if video.status != VideoStatus.ready:
        # 425 Too Early conveys "available in the future"
        return Response(
            content=(
                '{"success":false,"data":{"status":"' + video.status.value
                + '","message":"Pending optimization — available after tonight\'s job."}}'
            ),
            media_type="application/json",
            status_code=425,
        )
    if not video.hls_dir:
        raise APIError(code="VIDEO_NO_HLS", message="No HLS output available", status_code=500)

    ip = _client_ip(request)
    token, ttl = tok.issue_manifest_token(str(student.id), str(video.id), ip)

    # Watermark identity
    prof = (
        await db.execute(select(StudentProfile).where(StudentProfile.user_id == student.id))
    ).scalar_one_or_none()
    watermark = student.email
    display_name = prof.display_name if prof and prof.display_name else None

    return {
        "success": True,
        "data": {
            "status": video.status.value,
            "video_id": str(video.id),
            "duration_seconds": video.duration_seconds,
            "manifest_url": f"/api/v1/student/videos/{video.id}/manifest.m3u8?t={token}",
            "expires_in": ttl,
            "watermark_email": watermark,
            "watermark_name": display_name,
        },
    }


_URI_LINE_PATTERN = re.compile(r"^([^#].*?\.(?:m3u8|ts))\s*$", re.MULTILINE | re.IGNORECASE)


def _rewrite_master(text: str, *, video_id: str, ip: str, user_id: str, request: Request) -> str:
    """Master playlist references variant playlists like '480p/index.m3u8'.

    We rewrite each variant playlist line to an authenticated URL that, when hit,
    will serve the rewritten variant playlist (each segment URI is then rewritten
    to a tokenized segment URL).
    """
    def repl(m: re.Match) -> str:
        uri = m.group(1).strip()
        # Variant playlists are nested: e.g. '480p/index.m3u8'. Encode as a single 'name' so
        # the GET endpoint can resolve it back to the on-disk path.
        return f"/api/v1/student/videos/{video_id}/variant.m3u8?name={uri}&t={tok.issue_manifest_token(user_id, video_id, ip)[0]}"
    return _URI_LINE_PATTERN.sub(repl, text)


def _rewrite_variant(text: str, *, video_id: str, rendition: str, ip: str, user_id: str) -> str:
    """Variant playlist references segment files like 'seg_00001.ts'.

    Each .ts URI is rewritten to a tokenized segment URL bound to (user, video, rendition, segment).
    """
    def repl(m: re.Match) -> str:
        seg = m.group(1).strip()
        seg_token = tok.issue_segment_token(user_id, video_id, ip, rendition, seg)
        return f"/api/v1/student/videos/{video_id}/seg/{rendition}/{seg}?t={seg_token}"
    return _URI_LINE_PATTERN.sub(repl, text)


@router.get("/{video_id}/manifest.m3u8")
async def get_manifest(
    video_id: str,
    request: Request,
    t: str = Query(...),
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    video, batch_id = await _resolve_video_for_student(db, student, video_id)
    await _check_not_revoked(str(student.id), batch_id)
    ip = _client_ip(request)
    tok.verify(t, video_id, ip, expected_scope="manifest")

    if not video.hls_dir:
        raise APIError(code="VIDEO_NO_HLS", message="No HLS output", status_code=404)

    master_path = safe_playlist_path(video.hls_dir, "master.m3u8")
    if not master_path:
        raise APIError(code="VIDEO_NO_HLS", message="master.m3u8 missing", status_code=404)

    with open(master_path, "r", encoding="utf-8") as f:
        text = f.read()

    rewritten = _rewrite_master(
        text, video_id=str(video.id), ip=ip, user_id=str(student.id), request=request
    )
    return Response(
        content=rewritten,
        media_type="application/vnd.apple.mpegurl",
        headers={
            "Cache-Control": "private, no-store, no-cache, must-revalidate",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{video_id}/variant.m3u8")
async def get_variant(
    video_id: str,
    request: Request,
    name: str = Query(...),  # e.g. '480p/index.m3u8'
    t: str = Query(...),
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    video, batch_id = await _resolve_video_for_student(db, student, video_id)
    await _check_not_revoked(str(student.id), batch_id)
    ip = _client_ip(request)
    tok.verify(t, video_id, ip, expected_scope="manifest")

    if not video.hls_dir:
        raise APIError(code="VIDEO_NO_HLS", message="No HLS output", status_code=404)

    variant_path = safe_playlist_path(video.hls_dir, name)
    if not variant_path:
        raise APIError(code="VIDEO_NO_HLS", message="variant playlist missing", status_code=404)

    # Extract rendition folder name from 'name' (e.g. '480p/index.m3u8' -> '480p')
    parts = name.replace("\\", "/").split("/")
    if len(parts) < 2:
        raise APIError(code="VIDEO_NO_HLS", message="bad variant path", status_code=400)
    rendition = parts[0]

    with open(variant_path, "r", encoding="utf-8") as f:
        text = f.read()

    rewritten = _rewrite_variant(
        text, video_id=str(video.id), rendition=rendition, ip=ip, user_id=str(student.id)
    )
    return Response(
        content=rewritten,
        media_type="application/vnd.apple.mpegurl",
        headers={
            "Cache-Control": "private, no-store, no-cache, must-revalidate",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{video_id}/seg/{rendition}/{seg_name}")
async def get_segment(
    video_id: str,
    rendition: str,
    seg_name: str,
    request: Request,
    t: str = Query(...),
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    video, batch_id = await _resolve_video_for_student(db, student, video_id)
    await _check_not_revoked(str(student.id), batch_id)
    ip = _client_ip(request)
    tok.verify(t, video_id, ip, expected_scope=f"segment:{rendition}/{seg_name}")

    if not video.hls_dir:
        raise APIError(code="VIDEO_NO_HLS", message="No HLS output", status_code=404)

    seg_path = safe_segment_path(video.hls_dir, rendition, seg_name)
    if not seg_path:
        raise APIError(code="NOT_FOUND", message="Segment not found", status_code=404)

    return FileResponse(
        seg_path,
        media_type="video/mp2t",
        headers={
            "Cache-Control": "private, no-store, no-cache, must-revalidate",
            "X-Content-Type-Options": "nosniff",
        },
    )
