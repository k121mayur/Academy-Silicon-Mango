from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.batch import Batch, BatchStatus
from app.models.course import Course, DurationUnit
from app.models.session import Session, SessionStatus

# An interval is (start_datetime, end_datetime), both timezone-aware (UTC),
# matching how planning_service stamps `Session.scheduled_at`.
Interval = tuple[datetime, datetime]


def _combine(d: date, t: time) -> datetime:
    """Combine a date + wall-clock time into a UTC-labelled datetime.

    Mirrors planning_service._combine so prospective intervals line up exactly
    with the `scheduled_at` values stored on existing sessions.
    """
    return datetime.combine(d, t).replace(tzinfo=timezone.utc)


def _slot_type(slot) -> str:
    """Read a slot's type as a plain string from either a Pydantic
    ScheduleSlotIn (str) or a BatchScheduleSlot (SlotType enum)."""
    v = slot.slot_type
    return v.value if hasattr(v, "value") else str(v)


def expand_slots_to_intervals(
    course: Course,
    start_date: date,
    end_date: date,
    slots: list,
) -> list[Interval]:
    """Expand schedule slots into concrete dated time-intervals.

    This reproduces planning_service.sync_inherited_sessions' weekday/date
    mapping so a prospective batch's occurrences can be compared against the
    sessions that already exist for an instructor — before the new batch (and
    its sessions) are persisted.
    """
    intervals: list[Interval] = []

    if course.duration_unit == DurationUnit.weeks:
        start_weekday = start_date.weekday()
        weekday_slots = [
            s for s in slots if _slot_type(s) == "weekday" and s.weekday is not None
        ]
        for plan_idx in range(max(int(course.duration_value), 0)):
            week_start = start_date + timedelta(weeks=plan_idx)
            for slot in weekday_slots:
                day_offset = (slot.weekday - start_weekday) % 7
                session_date = week_start + timedelta(days=day_offset)
                if session_date > end_date:
                    continue
                intervals.append(
                    (_combine(session_date, slot.start_time), _combine(session_date, slot.end_time))
                )
    else:
        date_slots = [
            s for s in slots if _slot_type(s) == "date_based" and s.slot_date is not None
        ]
        for slot in date_slots:
            intervals.append(
                (_combine(slot.slot_date, slot.start_time), _combine(slot.slot_date, slot.end_time))
            )

    return intervals


async def _instructor_session_intervals(
    db: AsyncSession,
    instructor_id,
    exclude_batch_id: Optional[uuid.UUID],
) -> list[tuple[datetime, datetime, str]]:
    """All scheduled session intervals (with batch name) the instructor is
    already committed to, excluding cancelled batches/sessions and one batch."""
    stmt = (
        select(Session, Batch)
        .join(Batch, Batch.id == Session.batch_id)
        .where(
            Batch.instructor_id == instructor_id,
            Batch.status != BatchStatus.cancelled,
            Session.status != SessionStatus.cancelled,
        )
    )
    if exclude_batch_id is not None:
        stmt = stmt.where(Batch.id != exclude_batch_id)
    rows = (await db.execute(stmt)).all()
    out: list[tuple[datetime, datetime, str]] = []
    for sess, batch in rows:
        start = sess.scheduled_at
        end = start + timedelta(minutes=sess.duration_mins or 0)
        out.append((start, end, batch.name))
    return out


async def find_instructor_conflict(
    db: AsyncSession,
    instructor_id,
    intervals: list[Interval],
    exclude_batch_id: Optional[uuid.UUID] = None,
) -> Optional[str]:
    """Return a human-readable message if any prospective interval overlaps a
    session the instructor already teaches, else None.

    Two intervals overlap when ``a_start < b_end and b_start < a_end``.
    """
    if not intervals or not instructor_id:
        return None

    existing = await _instructor_session_intervals(db, instructor_id, exclude_batch_id)
    if not existing:
        return None

    for a_start, a_end in intervals:
        for b_start, b_end, b_name in existing:
            if a_start < b_end and b_start < a_end:
                when = a_start.strftime("%a %d %b %Y, %H:%M")
                return (
                    f"This instructor is already teaching '{b_name}' at an overlapping time "
                    f"({when}). Choose a different time slot or another instructor."
                )
    return None
