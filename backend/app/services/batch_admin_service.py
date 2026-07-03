"""Admin batch operations that need cross-table reasoning: delete-impact preview
and the on-disk cleanup that must accompany a full batch wipe.

The DB rows for a batch's children (enrollments, payments, sessions, resources,
videos, certificates, plans, slots) are removed automatically by ON DELETE
CASCADE when the batch row is deleted. Only the HLS video artifacts on disk need
manual cleanup, because they live outside the database.
"""
from __future__ import annotations

import os
import shutil
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.batch import Batch, Enrollment
from app.models.certificate import Certificate
from app.models.payment import Payment, PaymentStatus
from app.models.session import Session, SessionResource
from app.models.video import Video


async def batch_delete_impact(db: AsyncSession, batch: Batch) -> dict:
    """Count everything that would be destroyed if this batch were deleted.

    Used to render the type-the-name confirmation modal so the admin sees exactly
    what disappears (including the revenue that will drop off the dashboard).
    """
    enrollments = (
        await db.execute(select(func.count(Enrollment.id)).where(Enrollment.batch_id == batch.id))
    ).scalar_one()
    payments_count = (
        await db.execute(select(func.count(Payment.id)).where(Payment.batch_id == batch.id))
    ).scalar_one()
    payments_total = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.batch_id == batch.id, Payment.status == PaymentStatus.paid
            )
        )
    ).scalar_one()
    certificates = (
        await db.execute(select(func.count(Certificate.id)).where(Certificate.batch_id == batch.id))
    ).scalar_one()
    sessions = (
        await db.execute(select(func.count(Session.id)).where(Session.batch_id == batch.id))
    ).scalar_one()
    videos = (
        await db.execute(
            select(func.count(Video.id))
            .select_from(Video)
            .join(SessionResource, SessionResource.id == Video.session_resource_id)
            .join(Session, Session.id == SessionResource.session_id)
            .where(Session.batch_id == batch.id)
        )
    ).scalar_one()

    return {
        "batch_name": batch.name,
        "is_locked": batch.is_locked,
        "status": batch.status.value,
        "enrollments": enrollments,
        "payments_count": payments_count,
        "payments_total": float(payments_total or 0),
        "certificates": certificates,
        "sessions": sessions,
        "videos": videos,
    }


async def enrolled_student_ids(db: AsyncSession, batch_id) -> list[str]:
    """All distinct student ids enrolled in a batch (any status)."""
    rows = (
        await db.execute(
            select(Enrollment.student_id).where(Enrollment.batch_id == batch_id).distinct()
        )
    ).scalars().all()
    return [str(sid) for sid in rows]


async def collect_batch_video_files(db: AsyncSession, batch_id) -> list[tuple[Optional[str], Optional[str]]]:
    """Return (hls_dir, source_path) for every video attached to the batch's sessions.

    Collected BEFORE the batch is deleted, since the DB rows vanish on cascade.
    """
    rows = (
        await db.execute(
            select(Video.hls_dir, Video.source_path)
            .join(SessionResource, SessionResource.id == Video.session_resource_id)
            .join(Session, Session.id == SessionResource.session_id)
            .where(Session.batch_id == batch_id)
        )
    ).all()
    return [(hls_dir, source_path) for hls_dir, source_path in rows]


def remove_video_files(files: list[tuple[Optional[str], Optional[str]]]) -> None:
    """Best-effort removal of on-disk HLS trees and source uploads. Never raises —
    a leftover file is harmless; a failed delete must not fail the request."""
    for hls_dir, source_path in files:
        if hls_dir:
            try:
                shutil.rmtree(hls_dir, ignore_errors=True)
            except Exception as exc:
                print(f"[BATCH] Failed to rmtree {hls_dir}: {exc}")
        if source_path:
            try:
                os.unlink(source_path)
            except FileNotFoundError:
                pass
            except Exception as exc:
                print(f"[BATCH] Failed to unlink {source_path}: {exc}")
