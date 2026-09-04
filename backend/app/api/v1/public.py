from __future__ import annotations

import uuid as uuid_lib
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError, err_otp_rate_limited
from app.core.redis import otp_ip_rate_limit, otp_rate_limit
from app.core.utils import get_client_ip
from app.db.session import get_db
from app.dependencies.auth import get_current_user_optional
from app.models.batch import Batch, BatchScheduleSlot, BatchStatus, Enrollment, EnrollmentStatus
from app.models.course import Course, CourseInstructor, CourseType
from app.models.user import InstructorProfile, StudentProfile, User, UserRole
from app.models.certificate import Certificate, CertificateTemplate
from app.models.newsletter import NewsletterSubscriber
from app.schemas.newsletter import NewsletterRequest, NewsletterVerify, UnsubscribeRequest
from app.services.newsletter_service import (
    generate_unsubscribe_token,
    get_unsubscribe_url,
    request_newsletter_otp,
    unsubscribe_email,
    verify_newsletter_otp,
    verify_unsubscribe_token,
)
from app.services.payment_service import IST, enrollment_window_end, is_enrollment_open

router = APIRouter(prefix="/public", tags=["public"])


def _course_detail_dict(c: Course, instructors: list[dict], certificate_template: Optional[dict]) -> dict:
    return {
        "id": str(c.id),
        "title": c.title,
        "slug": c.slug,
        "description": c.description,
        "category": c.category,
        "language": c.language or "English",
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
        "is_published": c.is_published,
        "instructors": instructors,
        "certificate_template": certificate_template,
    }


_ENROLLABLE_STATUSES = (BatchStatus.upcoming, BatchStatus.active)


@router.get("/next-batch")
async def public_next_batch(
    response: Response,
    db: AsyncSession = Depends(get_db),
    viewer: Optional[User] = Depends(get_current_user_optional),
):
    """Returns the batch with the earliest upcoming start date across all courses."""
    is_admin = viewer is not None and viewer.role == UserRole.admin
    if is_admin:
        response.headers["Cache-Control"] = "private, no-store"

    today = datetime.now(IST).date()
    stmt = (
        select(Batch, Course)
        .join(Course, Course.id == Batch.course_id)
        .where(
            Batch.is_locked == False,  # noqa: E712
            Batch.is_enrollment_closed == False,  # noqa: E712
            Batch.status.in_(_ENROLLABLE_STATUSES),
            Batch.start_date >= today,
        )
    )
    if not is_admin:
        stmt = stmt.where(Course.is_published == True)  # noqa: E712

    # Query all eligible batches ordered by start_date ascending (lowest date of all)
    rows = (await db.execute(stmt.order_by(Batch.start_date.asc(), Batch.created_at.asc()))).all()

    if not rows:
        return {"success": True, "data": None}

    selected_batch: Optional[Batch] = None
    selected_course: Optional[Course] = None
    selected_enrolled: int = 0

    # Pick the earliest batch where enrollment is open and seats are available
    for b, c in rows:
        cnt = (
            await db.execute(
                select(func.count(Enrollment.id)).where(
                    Enrollment.batch_id == b.id, Enrollment.status == EnrollmentStatus.active
                )
            )
        ).scalar_one()
        if b.capacity is not None and cnt >= b.capacity:
            continue
        if is_enrollment_open(c, b, enrolled_count=cnt):
            selected_batch = b
            selected_course = c
            selected_enrolled = cnt
            break

    if not selected_batch or not selected_course:
        return {"success": True, "data": None}

    seats_left = (
        (selected_batch.capacity - selected_enrolled)
        if selected_batch.capacity is not None
        else None
    )
    is_full = seats_left is not None and seats_left <= 0
    enrollment_open = is_enrollment_open(selected_course, selected_batch)

    # Schedule slots
    slots_res = await db.execute(
        select(BatchScheduleSlot)
        .where(BatchScheduleSlot.batch_id == selected_batch.id)
        .order_by(
            BatchScheduleSlot.slot_date.asc().nulls_last(),
            BatchScheduleSlot.weekday.asc().nulls_last(),
            BatchScheduleSlot.start_time.asc(),
        )
    )
    schedule_slots = [
        {
            "slot_type": slot.slot_type.value,
            "weekday": slot.weekday,
            "slot_date": slot.slot_date.isoformat() if slot.slot_date else None,
            "start_time": slot.start_time.strftime("%H:%M") if slot.start_time else None,
            "end_time": slot.end_time.strftime("%H:%M") if slot.end_time else None,
        }
        for slot in slots_res.scalars().all()
    ]

    # Instructor name
    instructor_name = None
    if selected_batch.instructor_id:
        ip = (
            await db.execute(
                select(InstructorProfile).where(
                    InstructorProfile.user_id == selected_batch.instructor_id
                )
            )
        ).scalar_one_or_none()
        if ip:
            instructor_name = ip.display_name

    return {
        "success": True,
        "data": {
            "batch": {
                "id": str(selected_batch.id),
                "name": selected_batch.name,
                "delivery_mode": selected_batch.delivery_mode.value,
                "status": selected_batch.status.value,
                "start_date": selected_batch.start_date.isoformat() if selected_batch.start_date else None,
                "end_date": selected_batch.end_date.isoformat() if selected_batch.end_date else None,
                "capacity": selected_batch.capacity,
                "enrolled_count": selected_enrolled,
                "seats_left": seats_left,
                "is_full": is_full,
                "enrollment_open": enrollment_open,
                "enrollment_closes_on": enrollment_window_end(
                    selected_course, selected_batch
                ).isoformat(),
                "instructor_name": instructor_name,
                "schedule_slots": schedule_slots,
            },
            "course": {
                "id": str(selected_course.id),
                "title": selected_course.title,
                "slug": selected_course.slug,
                "description": selected_course.description,
                "category": selected_course.category,
                "language": selected_course.language or "English",
                "course_type": selected_course.course_type.value,
                "duration_unit": selected_course.duration_unit.value,
                "duration_value": selected_course.duration_value,
                "price": float(selected_course.price),
                "discount": float(selected_course.discount),
                "banner_url": selected_course.banner_url,
                "tags": selected_course.tags or [],
                "demo_youtube_url": selected_course.demo_youtube_url,
            },
        },
    }


@router.get("/courses")
async def public_courses(
    response: Response,
    search: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    course_type: Optional[str] = Query(None, alias="type"),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    viewer: Optional[User] = Depends(get_current_user_optional),
):
    # An authenticated admin previews unpublished (draft) courses too, so they can
    # see exactly how a course will look on the public explore page before publishing.
    is_admin = viewer is not None and viewer.role == UserRole.admin
    stmt = select(Course)
    if not is_admin:
        stmt = stmt.where(Course.is_published == True)  # noqa: E712
    else:
        # Never let a shared/CDN cache serve an admin's draft-inclusive response.
        response.headers["Cache-Control"] = "private, no-store"
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            func.lower(Course.title).like(term)
            | func.lower(func.coalesce(Course.category, "")).like(term)
            | func.lower(func.coalesce(Course.language, "")).like(term)
        )
    if language and language.strip() and language.strip().lower() != "all":
        stmt = stmt.where(func.lower(Course.language) == language.strip().lower())
    if course_type and course_type.strip() and course_type.strip().lower() != "all":
        raw_type = course_type.strip().lower()
        if raw_type in ("live", "live_classes", "live-classes"):
            stmt = stmt.where(Course.course_type == CourseType.live)
        elif raw_type in ("self_paced", "self-paced", "recorded"):
            stmt = stmt.where(Course.course_type == CourseType.self_paced)
    rows = (await db.execute(stmt.order_by(Course.created_at.desc()).limit(limit))).scalars().all()

    course_ids = [c.id for c in rows]
    batches_count: dict = {cid: 0 for cid in course_ids}
    if course_ids:
        today = datetime.now(IST).date()
        bres = await db.execute(
            select(Batch.course_id, func.count(Batch.id))
            .where(
                Batch.course_id.in_(course_ids),
                Batch.is_locked == False,  # noqa: E712
                Batch.is_enrollment_closed == False,  # noqa: E712
                Batch.status.in_(_ENROLLABLE_STATUSES),
                Batch.start_date >= today,
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
                "language": c.language or "English",
                "course_type": c.course_type.value,
                "duration_unit": c.duration_unit.value,
                "duration_value": c.duration_value,
                "price": float(c.price),
                "discount": float(c.discount),
                "banner_url": c.banner_url,
                "tags": c.tags or [],
                "is_published": c.is_published,
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


async def _resolve_course(db: AsyncSession, id_or_slug: str, include_unpublished: bool = False) -> Course:
    course: Optional[Course] = None
    try:
        uuid_lib.UUID(id_or_slug)
        course = await db.get(Course, id_or_slug)
    except (ValueError, TypeError):
        course = (
            await db.execute(select(Course).where(Course.slug == id_or_slug))
        ).scalar_one_or_none()
    if not course or (not course.is_published and not include_unpublished):
        raise APIError(code="NOT_FOUND", message="Course not found", status_code=404)
    return course


@router.get("/courses/{id_or_slug}")
async def public_course_detail(
    id_or_slug: str,
    response: Response,
    db: AsyncSession = Depends(get_db),
    viewer: Optional[User] = Depends(get_current_user_optional),
):
    is_admin = viewer is not None and viewer.role == UserRole.admin
    if is_admin:
        response.headers["Cache-Control"] = "private, no-store"
    course = await _resolve_course(db, id_or_slug, include_unpublished=is_admin)

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
async def public_course_batches(
    course_id: str,
    response: Response,
    db: AsyncSession = Depends(get_db),
    viewer: Optional[User] = Depends(get_current_user_optional),
):
    is_admin = viewer is not None and viewer.role == UserRole.admin
    if is_admin:
        response.headers["Cache-Control"] = "private, no-store"
    course = await _resolve_course(db, course_id, include_unpublished=is_admin)

    today = datetime.now(IST).date()
    batches = (
        await db.execute(
            select(Batch)
            .where(
                Batch.course_id == course.id,
                Batch.is_locked == False,  # noqa: E712
                Batch.is_enrollment_closed == False,  # noqa: E712
                Batch.status.in_(_ENROLLABLE_STATUSES),
                Batch.start_date >= today,
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
            select(BatchScheduleSlot)
            .where(BatchScheduleSlot.batch_id.in_(batch_ids))
            .order_by(
                BatchScheduleSlot.slot_date.asc().nulls_last(),
                BatchScheduleSlot.weekday.asc().nulls_last(),
                BatchScheduleSlot.start_time.asc(),
            )
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
        if is_full:
            # If batch is full, enrollment is closed -> hide from course page
            continue
        enrollment_open = is_enrollment_open(course, b, enrolled_count=enrolled)
        if not enrollment_open:
            # Closed batches must not be visible on the course page
            continue
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
    # Never fall back to the user's email here — this endpoint is public and
    # unauthenticated, so leaking an email address to anyone with a cert ID
    # (which is not a secret) would be a PII disclosure.
    student_name = (prof.display_name if prof and prof.display_name else None) or "Verified Student"
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


@router.post("/newsletter/unsubscribe")
@router.post("/unsubscribe")
async def newsletter_unsubscribe(payload: UnsubscribeRequest, db: AsyncSession = Depends(get_db)):
    """Public unsubscribe endpoint. Deactivates subscriber and records reason."""
    await unsubscribe_email(
        db=db,
        email=payload.email,
        reason=payload.reason,
        token=payload.token,
    )
    return {
        "success": True,
        "data": {
            "message": "You have been successfully unsubscribed.",
            "unsubscribed": True,
        },
    }


@router.get("/newsletter/unsubscribe-status")
@router.get("/unsubscribe/status")
async def newsletter_unsubscribe_status(
    email: str = Query(..., description="Email address to check"),
    token: Optional[str] = Query(None, description="Optional HMAC token"),
    db: AsyncSession = Depends(get_db),
):
    """Check subscription status for pre-filling or informing user on the unsubscribe page."""
    clean_email = email.strip().lower()
    res = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == clean_email)
    )
    sub = res.scalar_one_or_none()
    token_valid = verify_unsubscribe_token(clean_email, token) if token else False
    if not sub:
        return {
            "success": True,
            "data": {
                "exists": False,
                "is_active": True,
                "email": clean_email,
                "token_valid": token_valid,
            },
        }
    return {
        "success": True,
        "data": {
            "exists": True,
            "is_active": sub.is_active,
            "email": sub.email,
            "unsubscribed_at": sub.unsubscribed_at.isoformat() if sub.unsubscribed_at else None,
            "token_valid": token_valid,
        },
    }

