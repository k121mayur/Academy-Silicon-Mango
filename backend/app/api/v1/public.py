from __future__ import annotations

import uuid as uuid_lib
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError, err_otp_rate_limited
from app.core.redis import otp_ip_rate_limit, otp_rate_limit
from app.core.utils import get_client_ip
from app.db.session import get_db
from app.models.batch import Batch, BatchScheduleSlot, BatchStatus, Enrollment, EnrollmentStatus
from app.models.course import Course, CourseInstructor
from app.models.user import InstructorProfile, StudentProfile, User, UserRole
from app.models.certificate import Certificate, CertificateTemplate
from app.schemas.newsletter import NewsletterRequest, NewsletterVerify
from app.services.newsletter_service import request_newsletter_otp, verify_newsletter_otp
from app.services.payment_service import enrollment_window_end, is_enrollment_open

router = APIRouter(prefix="/public", tags=["public"])


def _course_detail_dict(c: Course, instructors: list[dict], certificate_template: Optional[dict]) -> dict:
    return {
        "id": str(c.id),
        "title": c.title,
        "slug": c.slug,
        "description": c.description,
        "category": c.category,
        "course_type": c.course_type.value,
        "duration_unit": c.duration_unit.value,
        "duration_value": c.duration_value,
        "price": float(c.price),
        "discount": float(c.discount),
        "banner_url": c.banner_url,
        "tags": c.tags or [],
        "syllabus_items": c.syllabus_items or [],
        "faqs": c.faqs or [],
        "certification_criteria": c.certification_criteria or [],
        "syllabus_pdf_url": c.syllabus_pdf_url,
        "demo_youtube_url": c.demo_youtube_url,
        "instructors": instructors,
        "certificate_template": certificate_template,
    }


_ENROLLABLE_STATUSES = (BatchStatus.upcoming, BatchStatus.active)


@router.get("/courses")
async def public_courses(
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Course).where(Course.is_published == True)  # noqa: E712
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            func.lower(Course.title).like(term) | func.lower(func.coalesce(Course.category, "")).like(term)
        )
    rows = (await db.execute(stmt.order_by(Course.created_at.desc()).limit(limit))).scalars().all()

    course_ids = [c.id for c in rows]
    batches_count: dict = {cid: 0 for cid in course_ids}
    if course_ids:
        bres = await db.execute(
            select(Batch.course_id, func.count(Batch.id))
            .where(
                Batch.course_id.in_(course_ids),
                Batch.is_locked == False,  # noqa: E712
                Batch.status.in_(_ENROLLABLE_STATUSES),
            )
            .group_by(Batch.course_id)
        )
        for cid, cnt in bres.all():
            batches_count[cid] = cnt

    items = []
    for c in rows:
        items.append(
            {
                "id": str(c.id),
                "title": c.title,
                "slug": c.slug,
                "description": c.description,
                "category": c.category,
                "course_type": c.course_type.value,
                "duration_unit": c.duration_unit.value,
                "duration_value": c.duration_value,
                "price": float(c.price),
                "discount": float(c.discount),
                "banner_url": c.banner_url,
                "tags": c.tags or [],
                "batches_count": batches_count.get(c.id, 0),
            }
        )
    return {"success": True, "data": items}


@router.get("/stats")
async def public_stats(db: AsyncSession = Depends(get_db)):
    students = (
        await db.execute(select(func.count(User.id)).where(User.role == UserRole.student))
    ).scalar_one()
    instructors = (
        await db.execute(select(func.count(User.id)).where(User.role == UserRole.instructor))
    ).scalar_one()
    courses = (
        await db.execute(select(func.count(Course.id)).where(Course.is_published == True))  # noqa: E712
    ).scalar_one()
    certificates = (await db.execute(select(func.count(Certificate.id)))).scalar_one()
    return {
        "success": True,
        "data": {
            "students": students,
            "instructors": instructors,
            "courses": courses,
            "certificates": certificates,
        },
    }


async def _resolve_course(db: AsyncSession, id_or_slug: str) -> Course:
    course: Optional[Course] = None
    try:
        uuid_lib.UUID(id_or_slug)
        course = await db.get(Course, id_or_slug)
    except (ValueError, TypeError):
        course = (
            await db.execute(select(Course).where(Course.slug == id_or_slug))
        ).scalar_one_or_none()
    if not course or not course.is_published:
        raise APIError(code="NOT_FOUND", message="Course not found", status_code=404)
    return course


@router.get("/courses/{id_or_slug}")
async def public_course_detail(id_or_slug: str, db: AsyncSession = Depends(get_db)):
    course = await _resolve_course(db, id_or_slug)

    # Instructors (batched)
    ci_rows = (
        await db.execute(
            select(CourseInstructor.instructor_id).where(CourseInstructor.course_id == course.id)
        )
    ).scalars().all()
    instructors: list[dict] = []
    if ci_rows:
        prof_rows = (
            await db.execute(
                select(InstructorProfile).where(InstructorProfile.user_id.in_(ci_rows))
            )
        ).scalars().all()
        for p in prof_rows:
            instructors.append(
                {"display_name": p.display_name, "avatar_url": p.avatar_url, "bio": p.bio}
            )

    # Certificate template (so students can see what they'll earn). Only the saved
    # background + field positions are exposed — never any issued certificate.
    tmpl = (
        await db.execute(
            select(CertificateTemplate).where(CertificateTemplate.course_id == course.id)
        )
    ).scalar_one_or_none()
    certificate_template = None
    if tmpl and tmpl.template_url:
        certificate_template = {
            "template_url": tmpl.template_url,
            "template_type": "pdf" if tmpl.template_url.lower().endswith(".pdf") else "image",
            "field_config": tmpl.field_config or {},
        }

    return {"success": True, "data": _course_detail_dict(course, instructors, certificate_template)}


@router.get("/courses/{course_id}/batches")
async def public_course_batches(course_id: str, db: AsyncSession = Depends(get_db)):
    course = await _resolve_course(db, course_id)

    batches = (
        await db.execute(
            select(Batch)
            .where(
                Batch.course_id == course.id,
                Batch.is_locked == False,  # noqa: E712
                Batch.status.in_(_ENROLLABLE_STATUSES),
            )
            .order_by(Batch.start_date)
        )
    ).scalars().all()

    batch_ids = [b.id for b in batches]

    # Active enrollment counts (batched)
    enrolled_by_batch: dict = {bid: 0 for bid in batch_ids}
    if batch_ids:
        eres = await db.execute(
            select(Enrollment.batch_id, func.count(Enrollment.id))
            .where(Enrollment.batch_id.in_(batch_ids), Enrollment.status == EnrollmentStatus.active)
            .group_by(Enrollment.batch_id)
        )
        for bid, cnt in eres.all():
            enrolled_by_batch[bid] = cnt

    # Schedule slots (batched)
    slots_by_batch: dict = {bid: [] for bid in batch_ids}
    if batch_ids:
        sres = await db.execute(
            select(BatchScheduleSlot).where(BatchScheduleSlot.batch_id.in_(batch_ids))
        )
        for slot in sres.scalars().all():
            slots_by_batch.setdefault(slot.batch_id, []).append(
                {
                    "slot_type": slot.slot_type.value,
                    "weekday": slot.weekday,
                    "slot_date": slot.slot_date.isoformat() if slot.slot_date else None,
                    "start_time": slot.start_time.strftime("%H:%M") if slot.start_time else None,
                    "end_time": slot.end_time.strftime("%H:%M") if slot.end_time else None,
                }
            )

    # Instructor names (batched)
    instructor_ids = [b.instructor_id for b in batches if b.instructor_id]
    instructor_names: dict = {}
    if instructor_ids:
        ip_rows = (
            await db.execute(
                select(InstructorProfile).where(InstructorProfile.user_id.in_(instructor_ids))
            )
        ).scalars().all()
        instructor_names = {p.user_id: p.display_name for p in ip_rows}

    items = []
    for b in batches:
        enrolled = enrolled_by_batch.get(b.id, 0)
        seats_left = (b.capacity - enrolled) if b.capacity is not None else None
        is_full = seats_left is not None and seats_left <= 0
        enrollment_open = is_enrollment_open(course, b)
        items.append(
            {
                "id": str(b.id),
                "name": b.name,
                "delivery_mode": b.delivery_mode.value,
                "status": b.status.value,
                "start_date": b.start_date.isoformat() if b.start_date else None,
                "end_date": b.end_date.isoformat() if b.end_date else None,
                "capacity": b.capacity,
                "enrolled_count": enrolled,
                "seats_left": seats_left,
                "is_full": is_full,
                "enrollment_open": enrollment_open,
                "enrollment_closes_on": enrollment_window_end(course, b).isoformat(),
                "instructor_name": instructor_names.get(b.instructor_id),
                "schedule_slots": slots_by_batch.get(b.id, []),
            }
        )
    return {"success": True, "data": items}


@router.get("/verify-certificate/{cert_id}")
async def verify_certificate(cert_id: str, db: AsyncSession = Depends(get_db)):
    """Public certificate verification. Returns valid=false rather than 404 so
    the response shape is uniform whether or not the cert exists."""
    try:
        uuid_lib.UUID(cert_id)
    except (ValueError, TypeError):
        return {"success": True, "data": {"valid": False}}

    row = (
        await db.execute(
            select(Certificate, User, StudentProfile, Batch, Course)
            .join(User, User.id == Certificate.student_id)
            .join(StudentProfile, StudentProfile.user_id == User.id, isouter=True)
            .join(Batch, Batch.id == Certificate.batch_id)
            .join(Course, Course.id == Batch.course_id)
            .where(Certificate.id == cert_id)
        )
    ).first()

    if not row:
        return {"success": True, "data": {"valid": False}}

    cert, user, prof, batch, course = row
    student_name = (prof.display_name if prof and prof.display_name else user.email) or ""
    return {
        "success": True,
        "data": {
            "valid": True,
            "student_name": student_name,
            "course_title": course.title,
            "batch_name": batch.name,
            "batch_start": batch.start_date.isoformat() if batch.start_date else None,
            "batch_end": batch.end_date.isoformat() if batch.end_date else None,
            "issued_at": cert.issued_at.isoformat() if cert.issued_at else None,
        },
    }


@router.post("/newsletter/request")
async def newsletter_request(
    payload: NewsletterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Step 1 of double opt-in: email a confirmation OTP. Rate-limited per-email
    (anti email-bombing) and per-IP (anti enumeration), reusing the OTP limiters."""
    allowed, reset_in = await otp_rate_limit(payload.email)
    if not allowed:
        raise err_otp_rate_limited(reset_in)
    ip = get_client_ip(request)
    allowed_ip, reset_ip = await otp_ip_rate_limit(ip)
    if not allowed_ip:
        raise err_otp_rate_limited(reset_ip)

    expires_in, already = await request_newsletter_otp(db, payload.email)
    if already:
        return {
            "success": True,
            "data": {
                "message": "You're already subscribed to our newsletter.",
                "already_subscribed": True,
                "expires_in": 0,
            },
        }
    return {
        "success": True,
        "data": {
            "message": "We've sent a confirmation code to your email.",
            "already_subscribed": False,
            "expires_in": expires_in,
        },
    }


@router.post("/newsletter/verify")
async def newsletter_verify(payload: NewsletterVerify, db: AsyncSession = Depends(get_db)):
    """Step 2 of double opt-in: validate the OTP and confirm the subscription."""
    await verify_newsletter_otp(db, payload.email, payload.otp)
    return {
        "success": True,
        "data": {"message": "Subscribed successfully", "subscribed": True},
    }
