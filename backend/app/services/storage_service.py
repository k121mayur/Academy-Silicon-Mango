from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Literal

import aiofiles
from fastapi import UploadFile

from app.core.config import settings


SUBDIRS = ("course_banners", "syllabus_pdfs", "session_resources", "receipts", "certificate_templates", "certificates")


def ensure_dirs() -> None:
    base = Path(settings.UPLOAD_DIR)
    base.mkdir(parents=True, exist_ok=True)
    for sub in SUBDIRS:
        (base / sub).mkdir(parents=True, exist_ok=True)


async def save_upload(file: UploadFile, subdir: Literal["course_banners", "syllabus_pdfs", "session_resources", "receipts", "certificate_templates", "certificates"]) -> str:
    """Save uploaded file under uploads/<subdir>/<uuid><ext>. Returns relative URL path."""
    ensure_dirs()
    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()
    fname = f"{uuid.uuid4().hex}{suffix}"
    rel = f"{subdir}/{fname}"
    abs_path = Path(settings.UPLOAD_DIR) / rel

    async with aiofiles.open(abs_path, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            await out.write(chunk)

    print(f"[STORAGE] Saved upload {rel} ({os.path.getsize(abs_path)} bytes)")
    return f"/uploads/{rel}"
