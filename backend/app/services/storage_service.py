from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Literal

import aiofiles
from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import APIError


SUBDIRS = (
    "course_banners",
    "syllabus_pdfs",
    "session_resources",
    "receipts",
    "certificate_templates",
    "certificates",
    "submissions",
)


# Per-subdir size cap in bytes. All non-video uploads share the MAX_DOC_MB ceiling.
def _doc_cap() -> int:
    return settings.MAX_DOC_MB * 1024 * 1024


def _cap_for(subdir: str) -> int:
    return _doc_cap()


def ensure_dirs() -> None:
    base = Path(settings.UPLOAD_DIR)
    base.mkdir(parents=True, exist_ok=True)
    for sub in SUBDIRS:
        (base / sub).mkdir(parents=True, exist_ok=True)


def _too_large_error(subdir: str, cap_bytes: int) -> APIError:
    cap_mb = max(1, cap_bytes // (1024 * 1024))
    return APIError(
        code="FILE_TOO_LARGE",
        message=f"Upload to '{subdir}' is limited to {cap_mb} MB.",
        status_code=413,
    )


async def save_upload(
    file: UploadFile,
    subdir: Literal[
        "course_banners",
        "syllabus_pdfs",
        "session_resources",
        "receipts",
        "certificate_templates",
        "certificates",
        "submissions",
    ],
) -> str:
    """Save uploaded file under uploads/<subdir>/<uuid><ext>. Returns relative URL path.

    Enforces a per-subdir byte cap (default MAX_DOC_MB = 2 MB). Video uploads are
    explicitly bounced — they must go through /instructor/videos/... instead.
    """
    # Bounce video uploads off the doc path so a 500 MB MP4 can never sit in /uploads.
    if subdir == "session_resources" and file.content_type and file.content_type.startswith("video/"):
        raise APIError(
            code="VIDEO_USE_DEDICATED_ENDPOINT",
            message="Video uploads must use /instructor/videos/... — they cannot be attached as generic session resources.",
            status_code=400,
        )

    ensure_dirs()
    cap = _cap_for(subdir)

    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()
    fname = f"{uuid.uuid4().hex}{suffix}"
    rel = f"{subdir}/{fname}"
    abs_path = Path(settings.UPLOAD_DIR) / rel

    total = 0
    try:
        async with aiofiles.open(abs_path, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > cap:
                    raise _too_large_error(subdir, cap)
                await out.write(chunk)
    except APIError:
        # Remove partial file before re-raising
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

    print(f"[STORAGE] Saved upload {rel} ({total} bytes, cap {cap})")
    return f"/uploads/{rel}"


async def save_bytes(
    data: bytes,
    subdir: Literal[
        "course_banners",
        "syllabus_pdfs",
        "session_resources",
        "receipts",
        "certificate_templates",
        "certificates",
        "submissions",
    ],
    extension: str = "pdf",
    filename: str | None = None,
) -> str:
    """Save raw bytes under uploads/<subdir>/<filename or uuid>.<ext>. Returns relative URL path.

    Internal callers (certificate rendering) — no cap is enforced here because the
    bytes are produced server-side, not user-supplied.
    """
    ensure_dirs()
    ext = extension.lstrip(".").lower()
    fname = filename if filename else f"{uuid.uuid4().hex}.{ext}"
    rel = f"{subdir}/{fname}"
    abs_path = Path(settings.UPLOAD_DIR) / rel

    async with aiofiles.open(abs_path, "wb") as out:
        await out.write(data)

    print(f"[STORAGE] Saved bytes {rel} ({len(data)} bytes)")
    return f"/uploads/{rel}"
