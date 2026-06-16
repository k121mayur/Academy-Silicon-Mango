from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import APIError
from app.db.session import get_db
from app.dependencies.auth import require_student
from app.models.batch import Batch, BatchStatus, Enrollment
from app.models.course import Course
from app.models.payment import Payment, PaymentStatus
from app.models.user import User
from app.schemas.student import CreateOrderIn, VerifyPaymentIn
from app.services.auth_service import is_profile_complete
from app.services.email_service import render_payment_receipt_email, send_email
from app.services.payment_service import (
    assert_enrollable,
    create_enrollment_with_payment,
    create_razorpay_order,
    get_existing_enrollment,
    payable_amount,
    to_paise,
    verify_razorpay_signature,
)
from app.services.receipt_service import generate_and_store_receipt
from app.services.storage_service import resolve_upload_path

router = APIRouter(prefix="/student", tags=["student:payments"])

_OPEN_STATUSES = (BatchStatus.upcoming, BatchStatus.active)


async def _issue_receipt(db: AsyncSession, payment: Payment, student: User, batch: Batch) -> Optional[str]:
    """Best-effort: render+store receipt (own commit), then email. Returns receipt_url or None.

    Never raises — a receipt/email failure must not undo a paid enrollment.
    """
    profile = student.student_profile
    student_name = (profile.display_name if profile else None) or student.email
    course = await db.get(Course, batch.course_id)
    course_title = course.title if course else ""
    try:
        url, pdf, receipt_no = await generate_and_store_receipt(
            db,
            payment,
            student_name=student_name,
            student_email=student.email,
            course_title=course_title,
            batch_name=batch.name,
            paid_at=datetime.utcnow(),
        )
        await db.commit()
    except Exception as exc:  # noqa: BLE001
        print(f"[PAYMENT] receipt generation failed: {exc}")
        await db.rollback()
        return None

    try:
        subj, html, text = render_payment_receipt_email(
            student_name=student_name,
            course_title=course_title,
            batch_name=batch.name,
            amount_display=f"₹{payment.amount:,.2f}",
            receipt_no=receipt_no,
            courses_url=f"{settings.FRONTEND_URL.rstrip('/')}/portal/my-courses",
        )
        await send_email(
            student.email,
            subj,
            html,
            text,
            attachments=[(f"receipt-{batch.name}.pdf", pdf, "application/pdf")],
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[PAYMENT] receipt email failed: {exc}")
    return url


def _prefill(student: User) -> dict:
    profile = student.student_profile
    return {
        "name": (profile.display_name if profile else None) or student.email,
        "email": student.email,
        "contact": f"+91{profile.phone}" if (profile and profile.phone) else "",
    }


@router.post("/payment/create-order")
async def create_order(
    payload: CreateOrderIn,
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    # 1. Authoritative profile gate
    if not is_profile_complete(student):
        raise APIError(
            code="PROFILE_INCOMPLETE",
            message="Complete your profile before enrolling.",
            status_code=403,
        )

    # 2. Load + validate batch
    batch = await db.get(Batch, payload.batch_id)
    if not batch:
        raise APIError(code="NOT_FOUND", message="Batch not found", status_code=404)
    if batch.is_locked or batch.status not in _OPEN_STATUSES:
        raise APIError(
            code="BATCH_NOT_OPEN", message="This batch is not open for enrollment", status_code=409
        )

    # 3. Capacity + duplicate guard → payable amount (rupees)
    payable = await assert_enrollable(db, batch, student)

    is_dev = settings.ENVIRONMENT == "development"
    is_dev_mock = bool(payload.mock and is_dev)

    # 4. Free course OR dev bypass → enroll directly, no Razorpay
    if payable <= 0 or is_dev_mock:
        tag = "FREE_ENROLL" if payable <= 0 else "DEV_MOCK"
        enr, payment = await create_enrollment_with_payment(
            db,
            batch=batch,
            student=student,
            amount=payable,
            status=PaymentStatus.paid,
            razorpay_order_id=tag,
            razorpay_payment_id=tag,
        )
        await db.commit()
        await _issue_receipt(db, payment, student, batch)
        receipt_url = (
            f"/api/v1/student/receipts/{payment.id}" if payment.receipt_url else None
        )
        return {
            "success": True,
            "data": {
                "free": True,
                "mock": is_dev_mock,
                "enrollment_id": str(enr.id),
                "batch_id": str(batch.id),
                "status": "active",
                "receipt_url": receipt_url,
            },
        }

    # 5. Real Razorpay order
    amount_paise = to_paise(payable)
    try:
        order, key_id = await create_razorpay_order(
            db,
            amount_paise=amount_paise,
            currency="INR",
            receipt=f"sma_{batch.id}_{student.id}",
        )
    except APIError as exc:
        # In dev, allow the mock path even when Razorpay keys are absent.
        code = exc.detail.get("code") if isinstance(exc.detail, dict) else None
        if code == "PAYMENT_NOT_CONFIGURED" and is_dev:
            return {
                "success": True,
                "data": {
                    "free": False,
                    "razorpay_unavailable": True,
                    "dev_mock_available": True,
                    "amount": amount_paise,
                    "amount_display": float(payable),
                    "currency": "INR",
                    "batch_id": str(batch.id),
                    "prefill": _prefill(student),
                },
            }
        raise

    return {
        "success": True,
        "data": {
            "free": False,
            "order_id": order["id"],
            "amount": amount_paise,
            "amount_display": float(payable),
            "currency": "INR",
            "key_id": key_id,
            "batch_id": str(batch.id),
            "prefill": _prefill(student),
            "dev_mock_available": is_dev,
        },
    }


def _success(enr: Enrollment, payment: Optional[Payment]) -> dict:
    # Receipts are private (contain student PII), so expose the AUTHENTICATED
    # download route, never the raw /uploads/ path. The browser sends the auth
    # cookie automatically when the link is opened.
    receipt_url = (
        f"/api/v1/student/receipts/{payment.id}"
        if (payment and payment.receipt_url)
        else None
    )
    return {
        "success": True,
        "data": {
            "enrollment_id": str(enr.id),
            "batch_id": str(enr.batch_id),
            "status": enr.status.value,
            "payment_id": str(payment.id) if payment else None,
            "receipt_url": receipt_url,
        },
    }


async def _payment_for_enrollment(db: AsyncSession, enrollment_id) -> Optional[Payment]:
    return (
        await db.execute(select(Payment).where(Payment.enrollment_id == enrollment_id))
    ).scalars().first()


@router.get("/receipts/{payment_id}")
async def download_receipt(
    payment_id: str,
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    """Serve a payment receipt, but ONLY to the student who owns it. Receipts are
    private (they contain PII), so this authenticated route replaces the old public
    /uploads/receipts/<id> path. The browser sends the auth cookie automatically
    when the link opens.

    New receipts are stored as a printable HTML page and rendered inline; legacy
    PDF receipts are still streamed for download."""
    payment = await db.get(Payment, payment_id)
    if not payment or payment.student_id != student.id:
        raise APIError(code="NOT_FOUND", message="Receipt not found", status_code=404)
    if not payment.receipt_url:
        raise APIError(code="NOT_FOUND", message="Receipt not available", status_code=404)
    path = resolve_upload_path(payment.receipt_url)
    if path.suffix.lower() == ".html":
        return HTMLResponse(content=path.read_text(encoding="utf-8"))
    return FileResponse(
        str(path),
        media_type="application/pdf",
        filename=f"receipt-{payment.id}.pdf",
    )


@router.post("/payment/verify-signature")
async def verify_signature(
    payload: VerifyPaymentIn,
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    batch = await db.get(Batch, payload.batch_id)
    if not batch:
        raise APIError(code="NOT_FOUND", message="Batch not found", status_code=404)

    order_id = payload.razorpay_order_id

    # 1. Idempotency — already enrolled? Treat as success.
    existing = await get_existing_enrollment(db, batch.id, student.id)
    if existing:
        pay = await _payment_for_enrollment(db, existing.id)
        return _success(existing, pay)

    # 2. Verify signature
    ok = await verify_razorpay_signature(
        db,
        order_id=order_id,
        payment_id=payload.razorpay_payment_id,
        signature=payload.razorpay_signature,
    )
    course = await db.get(Course, batch.course_id)
    payable = payable_amount(course)

    if not ok:
        # Record the failed attempt; create NO enrollment.
        db.add(
            Payment(
                student_id=student.id,
                batch_id=batch.id,
                amount=payable,
                currency="INR",
                status=PaymentStatus.failed,
                razorpay_order_id=order_id,
                razorpay_payment_id=payload.razorpay_payment_id,
                razorpay_signature=payload.razorpay_signature,
            )
        )
        await db.commit()
        raise APIError(
            code="PAYMENT_SIGNATURE_INVALID",
            message="We couldn't verify this payment. If you were charged, contact support.",
            status_code=400,
        )

    # 3. Atomic enrollment + payment. Capacity is a soft-override here (money was taken).
    if batch.capacity is not None:
        from app.services.payment_service import active_enrollment_count

        cnt = await active_enrollment_count(db, batch.id)
        if cnt >= batch.capacity:
            print(f"[PAYMENT] Capacity soft-override on paid enrollment: batch {batch.id}")

    try:
        enr, payment = await create_enrollment_with_payment(
            db,
            batch=batch,
            student=student,
            amount=payable,
            status=PaymentStatus.paid,
            razorpay_order_id=order_id,
            razorpay_payment_id=payload.razorpay_payment_id,
            razorpay_signature=payload.razorpay_signature,
        )
        await db.commit()
    except IntegrityError:
        # Concurrent verify hit the unique (batch_id, student_id) constraint.
        await db.rollback()
        existing = await get_existing_enrollment(db, batch.id, student.id)
        pay = await _payment_for_enrollment(db, existing.id) if existing else None
        if existing:
            return _success(existing, pay)
        raise APIError(code="ENROLL_FAILED", message="Could not complete enrollment", status_code=409)

    # 4. Best-effort receipt + email (after the durable commit). This sets
    #    payment.receipt_url; _success() turns it into an authenticated link.
    await _issue_receipt(db, payment, student, batch)
    return _success(enr, payment)
