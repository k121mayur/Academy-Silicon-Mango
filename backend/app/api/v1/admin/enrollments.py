from __future__ import annotations

import logging
import math

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.batch import Batch, Enrollment, EnrollmentStatus
from app.models.course import Course
from app.models.payment import Payment, PaymentStatus
from app.models.user import StudentProfile, User, UserRole
from app.schemas.batch import EnrollmentCreate
from app.services.payment_service import create_enrollment_with_payment, payable_amount

router = APIRouter(prefix="/enrollments", tags=["admin:enrollments"])

logger = logging.getLogger(__name__)


@router.get("")
async def list_enrollments(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    base = (
        select(Enrollment, User, Batch, Course)
        .join(User, User.id == Enrollment.student_id)
        .join(Batch, Batch.id == Enrollment.batch_id)
        .join(Course, Course.id == Batch.course_id)
    )
    cnt = select(func.count(Enrollment.id))
    total = (await db.execute(cnt)).scalar_one()
    base = base.order_by(Enrollment.enrolled_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(base)).all()
    items = []
    for enr, u, b, c in rows:
        prof_res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == u.id))
        prof = prof_res.scalar_one_or_none()
        items.append(
            {
                "id": str(enr.id),
                "student_id": str(u.id),
                "student_name": prof.display_name if prof else u.email,
                "student_email": u.email,
                "batch_id": str(b.id),
                "batch_name": b.name,
                "course_title": c.title,
                "enrolled_at": enr.enrolled_at,
                "status": enr.status.value,
            }
        )
    return {
        "success": True,
        "data": items,
        "meta": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit))},
    }


@router.post("")
async def admin_enroll_student(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    student_id = payload.get("student_id")
    batch_id = payload.get("batch_id")
    if not student_id or not batch_id:
        raise APIError(code="VALIDATION", message="student_id and batch_id are required")

    student = await db.get(User, student_id)
    if not student or student.role != UserRole.student:
        raise APIError(code="USER_002", message="Student not found", status_code=404)

    batch = await db.get(Batch, batch_id)
    if not batch:
        raise APIError(code="NOT_FOUND", message="Batch not found", status_code=404)

    existing = await db.execute(
        select(Enrollment).where(Enrollment.batch_id == batch.id, Enrollment.student_id == student.id)
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
            logger.warning(
                "Admin capacity override: enrolling into full batch %s (%s/%s)",
                batch.id, cnt, batch.capacity,
            )

    course = await db.get(Course, batch.course_id)
    try:
        enr, _payment = await create_enrollment_with_payment(
            db,
            batch=batch,
            student=student,
            amount=payable_amount(course),
            status=PaymentStatus.paid,
            razorpay_order_id="ADMIN_ENROLL",
        )
        await db.commit()
    except IntegrityError:
        # Double-submit / concurrent enroll hit the unique (batch_id, student_id)
        # constraint — treat as success and return the existing enrollment.
        await db.rollback()
        existing = (
            await db.execute(
                select(Enrollment).where(
                    Enrollment.batch_id == batch.id, Enrollment.student_id == student.id
                )
            )
        ).scalar_one_or_none()
        if existing:
            return {"success": True, "data": {"enrollment_id": str(existing.id)}}
        raise APIError(code="ENROLL_FAILED", message="Could not complete enrollment", status_code=409)
    logger.info("Admin-enrolled student %s in batch %s", student.email, batch.name)
    return {"success": True, "data": {"enrollment_id": str(enr.id)}}
