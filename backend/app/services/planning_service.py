from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.batch import (
    Batch,
    BatchPlan,
    BatchScheduleSlot,
    DeliveryMode,
    SlotType,
)
from app.models.course import Course, DurationUnit
from app.models.session import Session, SessionOrigin, SessionStatus, SessionType


async def ensure_batch_plans(db: AsyncSession, batch: Batch, course: Course) -> list[BatchPlan]:
    """Create plan rows 1..N if they don't exist."""
    existing = await db.execute(
        select(BatchPlan).where(BatchPlan.batch_id == batch.id).order_by(BatchPlan.plan_index)
    )
    plans = list(existing.scalars().all())
    if len(plans) >= course.duration_value:
        return plans

    label = "Week" if course.duration_unit == DurationUnit.weeks else "Day"
    have = {p.plan_index for p in plans}
    for i in range(1, course.duration_value + 1):
        if i in have:
            continue
        plan = BatchPlan(
            batch_id=batch.id,
            plan_index=i,
            title=f"{label} {i}",
            summary=None,
        )
        db.add(plan)
    await db.commit()

    res = await db.execute(
        select(BatchPlan).where(BatchPlan.batch_id == batch.id).order_by(BatchPlan.plan_index)
    )
    return list(res.scalars().all())


def _combine(d: date, t: time) -> datetime:
    return datetime.combine(d, t).replace(tzinfo=timezone.utc)


async def _ensure_day_slots(
    db: AsyncSession,
    batch: Batch,
    course: Course,
    existing_slots: list[BatchScheduleSlot],
) -> list[BatchScheduleSlot]:
    """Add missing date-based slots so a day-based batch has exactly N slots.

    Repairs batches created before the auto-fill UI fix where only N-1 (or fewer)
    slots were manually added. Fills gaps using consecutive dates from batch.start_date
    and inherits times from the last existing slot (fallback: 10:00–11:30).
    """
    n = int(course.duration_value)
    if not n:
        return existing_slots

    existing_dates = {s.slot_date for s in existing_slots if s.slot_date}
    if len(existing_dates) >= n:
        return existing_slots

    default_start_t = time(10, 0)
    default_end_t = time(11, 30)
    dated = [s for s in existing_slots if s.slot_date]
    if dated:
        last = max(dated, key=lambda s: s.slot_date)
        default_start_t = last.start_time or default_start_t
        default_end_t = last.end_time or default_end_t

    for i in range(n):
        expected_date = batch.start_date + timedelta(days=i)
        if expected_date not in existing_dates:
            db.add(BatchScheduleSlot(
                batch_id=batch.id,
                slot_type=SlotType.date_based,
                weekday=None,
                slot_date=expected_date,
                start_time=default_start_t,
                end_time=default_end_t,
            ))

    await db.commit()
    res = await db.execute(
        select(BatchScheduleSlot).where(
            BatchScheduleSlot.batch_id == batch.id,
            BatchScheduleSlot.slot_type == SlotType.date_based,
        )
    )
    return list(res.scalars().all())


async def sync_inherited_sessions(db: AsyncSession, batch_id: uuid.UUID) -> int:
    """Delete existing inherited sessions, then re-create from schedule slots & plans.

    Returns count of sessions created.
    """
    res = await db.execute(
        select(Batch)
        .options(
            selectinload(Batch.schedule_slots),
            selectinload(Batch.plans),
            selectinload(Batch.course),
        )
        .where(Batch.id == batch_id)
    )
    batch = res.scalar_one_or_none()
    if not batch:
        return 0

    course = batch.course

    await ensure_batch_plans(db, batch, course)

    # Refresh plans
    res = await db.execute(
        select(BatchPlan).where(BatchPlan.batch_id == batch.id).order_by(BatchPlan.plan_index)
    )
    plans = list(res.scalars().all())

    # Delete inherited sessions only
    await db.execute(
        delete(Session).where(Session.batch_id == batch.id, Session.origin == SessionOrigin.inherited)
    )
    await db.commit()

    created = 0

    if batch.delivery_mode == DeliveryMode.recorded:
        # One recorded session per plan
        for idx, plan in enumerate(plans):
            sess = Session(
                batch_id=batch.id,
                plan_id=plan.id,
                title=plan.title or f"Session {idx + 1}",
                description=plan.summary,
                session_type=SessionType.recorded,
                status=SessionStatus.scheduled,
                origin=SessionOrigin.inherited,
                scheduled_at=_combine(batch.start_date, time(10, 0)) + timedelta(days=idx),
                duration_mins=60,
            )
            db.add(sess)
            created += 1
        await db.commit()
        return created

    # delivery_mode = live
    if course.duration_unit == DurationUnit.weeks:
        # Weekly schedule — for each plan (week), iterate weekday slots
        weekday_slots = [s for s in batch.schedule_slots if s.slot_type == SlotType.weekday and s.weekday is not None]
        for plan_idx, plan in enumerate(plans):
            week_start = batch.start_date + timedelta(weeks=plan_idx)
            for slot in weekday_slots:
                # Find the date in this week matching slot.weekday
                # week_start is the conceptual start; map the weekday inside this week
                start_weekday = batch.start_date.weekday()
                day_offset = (slot.weekday - start_weekday) % 7
                session_date = week_start + timedelta(days=day_offset)
                if session_date > batch.end_date:
                    continue
                duration = (
                    datetime.combine(session_date, slot.end_time) - datetime.combine(session_date, slot.start_time)
                )
                duration_mins = max(int(duration.total_seconds() // 60), 30)
                sess = Session(
                    batch_id=batch.id,
                    plan_id=plan.id,
                    title=plan.title or f"Week {plan_idx + 1}",
                    description=plan.summary,
                    session_type=SessionType.live,
                    status=SessionStatus.scheduled,
                    origin=SessionOrigin.inherited,
                    scheduled_at=_combine(session_date, slot.start_time),
                    duration_mins=duration_mins,
                )
                db.add(sess)
                created += 1
    else:
        # Date-based: fill any missing slots first so batches created before the
        # auto-fill UI fix are repaired, then create one session per slot (capped
        # at plan count to preserve the 1:1 day↔session mapping).
        raw_date_slots = [
            s for s in batch.schedule_slots
            if s.slot_type == SlotType.date_based and s.slot_date
        ]
        all_date_slots = await _ensure_day_slots(db, batch, course, raw_date_slots)
        date_slots = sorted(all_date_slots, key=lambda s: s.slot_date)
        for idx, slot in enumerate(date_slots[: len(plans)]):
            plan = plans[idx] if idx < len(plans) else (plans[-1] if plans else None)
            duration = (
                datetime.combine(slot.slot_date, slot.end_time) - datetime.combine(slot.slot_date, slot.start_time)
            )
            duration_mins = max(int(duration.total_seconds() // 60), 30)
            sess = Session(
                batch_id=batch.id,
                plan_id=plan.id if plan else None,
                title=plan.title if plan else f"Day {idx + 1}",
                description=plan.summary if plan else None,
                session_type=SessionType.live,
                status=SessionStatus.scheduled,
                origin=SessionOrigin.inherited,
                scheduled_at=_combine(slot.slot_date, slot.start_time),
                duration_mins=duration_mins,
            )
            db.add(sess)
            created += 1

    await db.commit()
    print(f"[PLANNING] Created {created} inherited sessions for batch {batch.id}")
    return created
