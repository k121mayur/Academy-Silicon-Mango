from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceRecord, AttendanceStatus
from app.models.batch import Batch
from app.models.session import Session as ClassSession, SessionStatus, SessionType


def session_end_at(session: ClassSession) -> datetime:
    """A session has no end-time column — end = scheduled_at + duration_mins."""
    scheduled = session.scheduled_at
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=timezone.utc)
    return scheduled + timedelta(minutes=session.duration_mins or 60)


async def find_ended_sessions_without_attendance(
    db: AsyncSession,
    *,
    within_hours: int,
    instructor_id: Optional[object] = None,
    only_unreminded: bool = False,
) -> list[tuple[ClassSession, Batch]]:
    """Live, non-cancelled sessions that ended within the last `within_hours`
    and have no attendance marked yet (no record with status != not_marked).

    Returns (session, batch) pairs ordered by end time, most recent first.
    """
    now = datetime.now(timezone.utc)
    # Coarse SQL window on scheduled_at (end time is computed in Python);
    # pad by 24h to cover long sessions whose start predates the window.
    lo = now - timedelta(hours=within_hours) - timedelta(hours=24)

    stmt = (
        select(ClassSession, Batch)
        .join(Batch, Batch.id == ClassSession.batch_id)
        .where(
            ClassSession.session_type == SessionType.live,
            ClassSession.status != SessionStatus.cancelled,
            ClassSession.scheduled_at >= lo,
            ClassSession.scheduled_at <= now,
        )
    )
    if instructor_id is not None:
        stmt = stmt.where(Batch.instructor_id == instructor_id)
    if only_unreminded:
        stmt = stmt.where(ClassSession.attendance_reminder_sent_at.is_(None))

    rows = (await db.execute(stmt)).all()

    window_start = now - timedelta(hours=within_hours)
    candidates = [
        (sess, batch)
        for sess, batch in rows
        if window_start <= session_end_at(sess) <= now
    ]
    if not candidates:
        return []

    marked_res = await db.execute(
        select(AttendanceRecord.session_id)
        .where(
            AttendanceRecord.session_id.in_([sess.id for sess, _ in candidates]),
            AttendanceRecord.status != AttendanceStatus.not_marked,
        )
        .group_by(AttendanceRecord.session_id)
        .having(func.count() > 0)
    )
    marked_ids = {r[0] for r in marked_res.all()}

    pending = [(s, b) for s, b in candidates if s.id not in marked_ids]
    pending.sort(key=lambda pair: session_end_at(pair[0]), reverse=True)
    return pending
