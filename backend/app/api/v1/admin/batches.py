from __future__ import annotations

import math
from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import APIError
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.batch import (
    Batch,
    BatchPlan,
    BatchScheduleSlot,
    BatchStatus,
    DeliveryMode,
    Enrollment,
    EnrollmentStatus,
    SlotType,
)
from app.models.course import Course
from app.models.user import InstructorProfile, StudentProfile, User, UserRole
from app.schemas.batch import (
    BatchCreate,
    BatchPlanIn,
    BatchPlanPublic,
    BatchPublic,
    BatchUpdate,
    EnrollmentCreate,
    EnrollmentPublic,
)
from app.services.planning_service import sync_inherited_sessions

router = APIRouter(prefix="/batches", tags=["admin:batches"])


async def _enriched_batch(db: AsyncSession, batch: Batch) -> BatchPublic:
    course = await db.get(Course, batch.course_id)
    instructor_name = None
    if batch.instructor_id:
        prof = await db.execute(
            select(InstructorProfile).where(InstructorProfile.user_id == batch.instructor_id)
        )
        ip = prof.scalar_one_or_none()
        if ip:
            instructor_name = ip.display_name
    enrolled = (
        await db.execute(
            select(func.count(Enrollment.id)).where(
                Enrollment.batch_id == batch.id, Enrollment.status == EnrollmentStatus.active
            )
        )
    ).scalar_one()
    return BatchPublic(
        id=str(batch.id),
        course_id=str(batch.course_id),
        course_title=course.title if course else None,
        instructor_id=str(batch.instructor_id) if batch.instructor_id else None,
        instructor_name=instructor_name,
        name=batch.name,
        delivery_mode=batch.delivery_mode.value,
        status=batch.status.value,
        start_date=batch.start_date,
        end_date=batch.end_date,
        capacity=batch.capacity,
        enrolled_count=enrolled,
        is_locked=batch.is_locked,
        created_at=batch.created_at,
    )


@router.get("")
async def list_batches(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    course_id: Optional[str] = None,
    mode: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    stmt = select(Batch)
    cnt_stmt = select(func.count(Batch.id))
    if course_id:
        stmt = stmt.where(Batch.course_id == course_id)
        cnt_stmt = cnt_stmt.where(Batch.course_id == course_id)
    if mode:
        try:
            m = DeliveryMode(mode)
            stmt = stmt.where(Batch.delivery_mode == m)
            cnt_stmt = cnt_stmt.where(Batch.delivery_mode == m)
        except ValueError:
            pass
    if status:
        try:
            s = BatchStatus(status)
            stmt = stmt.where(Batch.status == s)
            cnt_stmt = cnt_stmt.where(Batch.status == s)
        except ValueError:
            pass
    if search:
        like = f"%{search}%"
        stmt = stmt.where(Batch.name.ilike(like))
        cnt_stmt = cnt_stmt.where(Batch.name.ilike(like))

    total = (await db.execute(cnt_stmt)).scalar_one()
    stmt = stmt.order_by(Batch.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    items = [await _enriched_batch(db, b) for b in rows]
    return {
        "success": True,
        "data": items,
        "meta": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit))},
    }


def _auto_status(start: date_type, end: date_type) -> BatchStatus:
    today = date_type.today()
    if today < start:
        return BatchStatus.upcoming
    if today > end:
        return BatchStatus.completed
    return BatchStatus.active


@router.post("", response_model=BatchPublic)
async def create_batch(
    payload: BatchCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    course = await db.get(Course, payload.course_id)
    if not course:
        raise APIError(code="NOT_FOUND", message="Course not found", status_code=404)

    if payload.end_date < payload.start_date:
        raise APIError(code="VALIDATION", message="End date must be after start date")

    try:
        mode = DeliveryMode(payload.delivery_mode)
    except ValueError:
        raise APIError(code="VALIDATION", message="Invalid delivery mode")

    instructor_id = None
    if payload.instructor_id:
        target = await db.get(User, payload.instructor_id)
        if not target or target.role != UserRole.instructor:
            raise APIError(code="USER_002", message="Instructor user not found", status_code=404)
        instructor_id = payload.instructor_id

    batch = Batch(
        course_id=course.id,
        instructor_id=instructor_id,
        name=payload.name,
        delivery_mode=mode,
        status=_auto_status(payload.start_date, payload.end_date),
        start_date=payload.start_date,
        end_date=payload.end_date,
        capacity=payload.capacity,
    )
    db.add(batch)
    await db.flush()

    if mode == DeliveryMode.live:
        for s in payload.schedule_slots:
            try:
                st = SlotType(s.slot_type)
            except ValueError:
                continue
            slot = BatchScheduleSlot(
                batch_id=batch.id,
                slot_type=st,
                weekday=s.weekday,
                slot_date=s.slot_date,
                start_time=s.start_time,
                end_time=s.end_time,
            )
            db.add(slot)
    await db.commit()
    await db.refresh(batch)

    # Auto-create plans + sessions
    await sync_inherited_sessions(db, batch.id)
    print(f"[ADMIN] Batch created: {batch.name} ({batch.id})")
    return await _enriched_batch(db, batch)


@router.get("/{batch_id}", response_model=BatchPublic)
async def get_batch(batch_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    batch = await db.get(Batch, batch_id)
    if not batch:
        raise APIError(code="NOT_FOUND", message="Batch not found", status_code=404)
    return await _enriched_batch(db, batch)


@router.put("/{batch_id}", response_model=BatchPublic)
async def update_batch(
    batch_id: str,
    payload: BatchUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    batch = await db.get(Batch, batch_id)
    if not batch:
        raise APIError(code="NOT_FOUND", message="Batch not found", status_code=404)
    if batch.is_locked:
        raise APIError(code="BATCH_003", message="Batch is locked")

    data = payload.model_dump(exclude_unset=True)
    if "delivery_mode" in data:
        batch.delivery_mode = DeliveryMode(data.pop("delivery_mode"))
    if "status" in data:
        batch.status = BatchStatus(data.pop("status"))
    for k, v in data.items():
        if hasattr(batch, k):
            setattr(batch, k, v)
    await db.commit()
    await db.refresh(batch)
    return await _enriched_batch(db, batch)


@router.post("/{batch_id}/assign-instructor", response_model=BatchPublic)
async def assign_instructor(
    batch_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    batch = await db.get(Batch, batch_id)
    if not batch:
        raise APIError(code="NOT_FOUND", message="Batch not found", status_code=404)
    if batch.is_locked:
        raise APIError(code="BATCH_003", message="Batch is locked")

    # null/empty/"unassigned" means: clear the instructor.
    instructor_id = payload.get("instructor_id")
    if not instructor_id:
        batch.instructor_id = None
        await db.commit()
        await db.refresh(batch)
        return await _enriched_batch(db, batch)

    # Validate the user actually exists and is an instructor.
    target = await db.get(User, instructor_id)
    if not target or target.role != UserRole.instructor:
        raise APIError(code="USER_002", message="Instructor user not found", status_code=404)

    batch.instructor_id = instructor_id
    await db.commit()
    await db.refresh(batch)
    return await _enriched_batch(db, batch)


@router.get("/{batch_id}/plans", response_model=list[BatchPlanPublic])
async def get_plans(batch_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    res = await db.execute(
        select(BatchPlan).where(BatchPlan.batch_id == batch_id).order_by(BatchPlan.plan_index)
    )
    rows = res.scalars().all()
    return [BatchPlanPublic(id=str(p.id), plan_index=p.plan_index, title=p.title, summary=p.summary) for p in rows]


@router.put("/{batch_id}/plans")
async def update_plans(
    batch_id: str,
    payload: list[BatchPlanIn],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    res = await db.execute(select(BatchPlan).where(BatchPlan.batch_id == batch_id))
    plans = {p.plan_index: p for p in res.scalars().all()}
    for item in payload:
        if item.plan_index in plans:
            plans[item.plan_index].title = item.title
            plans[item.plan_index].summary = item.summary
    await db.commit()
    return {"success": True, "message": "Plans updated"}


@router.post("/{batch_id}/sync-sessions")
async def sync_sessions(batch_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    count = await sync_inherited_sessions(db, batch_id)
    return {"success": True, "data": {"sessions_created": count}}


@router.get("/{batch_id}/enrollments", response_model=list[EnrollmentPublic])
async def list_enrollments(
    batch_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
):
    res = await db.execute(
        select(Enrollment, User, StudentProfile)
        .join(User, User.id == Enrollment.student_id)
        .join(StudentProfile, StudentProfile.user_id == User.id, isouter=True)
        .where(Enrollment.batch_id == batch_id)
        .order_by(Enrollment.enrolled_at.desc())
    )
    items = []
    for enr, user, prof in res.all():
        items.append(
            EnrollmentPublic(
                id=str(enr.id),
                student_id=str(user.id),
                student_name=prof.display_name if prof else user.email,
                student_email=user.email,
                batch_id=str(enr.batch_id),
                enrolled_at=enr.enrolled_at,
                status=enr.status.value,
            )
        )
    return items


@router.post("/{batch_id}/enroll", response_model=EnrollmentPublic)
async def enroll_student(
    batch_id: str,
    payload: EnrollmentCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    batch = await db.get(Batch, batch_id)
    if not batch:
        raise APIError(code="NOT_FOUND", message="Batch not found", status_code=404)
    if batch.is_locked:
        raise APIError(code="BATCH_003", message="Batch is locked")

    student = await db.get(User, payload.student_id)
    if not student or student.role != UserRole.student:
        raise APIError(code="USER_002", message="Student not found", status_code=404)

    existing = await db.execute(
        select(Enrollment).where(
            Enrollment.batch_id == batch.id, Enrollment.student_id == student.id
        )
    )
    if existing.scalar_one_or_none():
        raise APIError(code="BATCH_002", message="Student already enrolled")

    if batch.capacity is not None:
        cnt = (
            await db.execute(
                select(func.count(Enrollment.id)).where(
                    Enrollment.batch_id == batch.id, Enrollment.status == EnrollmentStatus.active
                )
            )
        ).scalar_one()
        if cnt >= batch.capacity:
            print(f"[ADMIN] Capacity warning: {cnt}/{batch.capacity} for batch {batch.id} — admin override")

    enr = Enrollment(batch_id=batch.id, student_id=student.id, status=EnrollmentStatus.active)
    db.add(enr)
    await db.commit()
    await db.refresh(enr)

    prof_res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == student.id))
    prof = prof_res.scalar_one_or_none()
    print(f"[ADMIN] Enrolled student {student.email} in batch {batch.name}")
    return EnrollmentPublic(
        id=str(enr.id),
        student_id=str(student.id),
        student_name=prof.display_name if prof else student.email,
        student_email=student.email,
        batch_id=str(enr.batch_id),
        enrolled_at=enr.enrolled_at,
        status=enr.status.value,
    )


@router.delete("/{batch_id}/enrollments/{enrollment_id}")
async def remove_enrollment(
    batch_id: str,
    enrollment_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    enr = await db.get(Enrollment, enrollment_id)
    if not enr or str(enr.batch_id) != batch_id:
        raise APIError(code="NOT_FOUND", message="Enrollment not found", status_code=404)
    await db.delete(enr)
    await db.commit()
    return {"success": True, "message": "Enrollment removed"}


@router.post("/{batch_id}/complete", response_model=BatchPublic)
async def complete_batch(
    batch_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
):
    batch = await db.get(Batch, batch_id)
    if not batch:
        raise APIError(code="NOT_FOUND", message="Batch not found", status_code=404)
    batch.status = BatchStatus.completed
    batch.is_locked = True
    await db.commit()
    await db.refresh(batch)
    print(f"[ADMIN] Batch completed and locked: {batch.name}")
    return await _enriched_batch(db, batch)
