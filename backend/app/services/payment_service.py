from __future__ import annotations

from decimal import Decimal
from typing import Optional

import anyio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import APIError
from app.models.batch import Batch, Enrollment, EnrollmentStatus
from app.models.course import Course
from app.models.payment import Payment, PaymentSettings, PaymentStatus
from app.models.user import User


# ---- enrollment / capacity helpers (shared by admin-enroll and self-enroll) ----

async def active_enrollment_count(db: AsyncSession, batch_id) -> int:
    return (
        await db.execute(
            select(func.count(Enrollment.id)).where(
                Enrollment.batch_id == batch_id, Enrollment.status == EnrollmentStatus.active
            )
        )
    ).scalar_one()


async def get_existing_enrollment(db: AsyncSession, batch_id, student_id) -> Optional[Enrollment]:
    return (
        await db.execute(
            select(Enrollment).where(
                Enrollment.batch_id == batch_id, Enrollment.student_id == student_id
            )
        )
    ).scalar_one_or_none()


def payable_amount(course: Optional[Course]) -> Decimal:
    """Final payable in rupees. `discount` is a PERCENTAGE (0–100) of the price."""
    if not course:
        return Decimal("0")
    price = course.price or Decimal("0")
    discount_pct = course.discount or Decimal("0")
    amt = (price - (price * discount_pct / Decimal("100"))).quantize(Decimal("0.01"))
    return amt if amt > 0 else Decimal("0")


def to_paise(amount: Decimal) -> int:
    """Rupees(Decimal) -> integer paise. The ONLY place this conversion happens."""
    return int((Decimal(amount).quantize(Decimal("0.01")) * 100))


async def assert_enrollable(db: AsyncSession, batch: Batch, student: User) -> Decimal:
    """Hard guard for the student self-enroll path. Returns payable amount (rupees).

    Unlike admin-enroll (which only logs a capacity warning), the student path
    blocks a duplicate enrollment or a full batch outright.
    """
    if await get_existing_enrollment(db, batch.id, student.id):
        raise APIError(code="BATCH_002", message="You are already enrolled in this batch")
    if batch.capacity is not None:
        cnt = await active_enrollment_count(db, batch.id)
        if cnt >= batch.capacity:
            raise APIError(code="BATCH_FULL", message="This batch is full", status_code=409)
    course = await db.get(Course, batch.course_id)
    return payable_amount(course)


async def create_enrollment_with_payment(
    db: AsyncSession,
    *,
    batch: Batch,
    student: User,
    amount: Decimal,
    currency: str = "INR",
    status: PaymentStatus = PaymentStatus.paid,
    razorpay_order_id: Optional[str] = None,
    razorpay_payment_id: Optional[str] = None,
    razorpay_signature: Optional[str] = None,
) -> tuple[Enrollment, Payment]:
    """Shared creator — admin-enroll and self-enroll both converge here. Caller commits."""
    enr = Enrollment(batch_id=batch.id, student_id=student.id, status=EnrollmentStatus.active)
    db.add(enr)
    await db.flush()
    payment = Payment(
        enrollment_id=enr.id,
        student_id=student.id,
        batch_id=batch.id,
        amount=amount,
        currency=currency,
        status=status,
        razorpay_order_id=razorpay_order_id,
        razorpay_payment_id=razorpay_payment_id,
        razorpay_signature=razorpay_signature,
    )
    db.add(payment)
    await db.flush()
    return enr, payment


# ---- Razorpay integration ----

def _require_sdk():
    try:
        import razorpay  # noqa: F401
        return razorpay
    except ImportError:
        raise APIError(
            code="PAYMENT_NOT_CONFIGURED",
            message="Payment library is not installed on the server.",
            status_code=503,
        )


async def resolve_razorpay_keys(db: AsyncSession) -> tuple[str, str]:
    s = (await db.execute(select(PaymentSettings).limit(1))).scalar_one_or_none()
    key_id = s.key_id if (s and s.key_id) else settings.RAZORPAY_KEY_ID
    key_secret = s.key_secret if (s and s.key_secret) else settings.RAZORPAY_KEY_SECRET
    if not key_id or not key_secret:
        raise APIError(
            code="PAYMENT_NOT_CONFIGURED",
            message="Online payments are not configured yet. Please contact support.",
            status_code=503,
        )
    return key_id, key_secret


async def create_razorpay_order(
    db: AsyncSession, *, amount_paise: int, currency: str, receipt: str
) -> tuple[dict, str]:
    razorpay = _require_sdk()
    key_id, key_secret = await resolve_razorpay_keys(db)
    client = razorpay.Client(auth=(key_id, key_secret))

    def _create():
        return client.order.create(
            {
                "amount": amount_paise,
                "currency": currency,
                "receipt": receipt[:40],
                "payment_capture": 1,
            }
        )

    order = await anyio.to_thread.run_sync(_create)
    return order, key_id


async def verify_razorpay_signature(
    db: AsyncSession, *, order_id: str, payment_id: str, signature: str
) -> bool:
    razorpay = _require_sdk()
    key_id, key_secret = await resolve_razorpay_keys(db)
    client = razorpay.Client(auth=(key_id, key_secret))

    def _verify() -> bool:
        try:
            client.utility.verify_payment_signature(
                {
                    "razorpay_order_id": order_id,
                    "razorpay_payment_id": payment_id,
                    "razorpay_signature": signature,
                }
            )
            return True
        except razorpay.errors.SignatureVerificationError:
            return False

    return await anyio.to_thread.run_sync(_verify)
