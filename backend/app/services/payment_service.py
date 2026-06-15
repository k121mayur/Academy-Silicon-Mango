from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

import anyio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import APIError
from app.models.batch import Batch, Enrollment, EnrollmentStatus
from app.models.course import Course, DurationUnit
from app.models.payment import Payment, PaymentSettings, PaymentStatus
from app.models.user import User


# ---- late-enrollment window (shared by the public endpoint and the self-enroll guard) ----

# How long after a batch starts students may still enroll, by course duration unit.
# Weeks-based courses stay open through their first week; days-based courses a couple of days.
LATE_ENROLL_GRACE_DAYS = {DurationUnit.weeks: 7, DurationUnit.days: 2}


def enrollment_window_end(course: Course, batch: Batch) -> date:
    """Last day (inclusive) a student may self-enroll in this batch."""
    grace = LATE_ENROLL_GRACE_DAYS.get(course.duration_unit, 7)
    return batch.start_date + timedelta(days=grace)


def is_enrollment_open(course: Course, batch: Batch) -> bool:
    """Upcoming batches are always open; once started, the grace window applies."""
    return date.today() <= enrollment_window_end(course, batch)


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
    if course and not is_enrollment_open(course, batch):
        raise APIError(
            code="ENROLL_CLOSED",
            message="Enrollment for this batch has closed.",
            status_code=409,
        )
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


async def get_active_payment_mode(db: AsyncSession) -> str:
    """The admin-selected active mode ('test' | 'live'). Defaults to 'test'
    until an admin explicitly switches it from the Payment Settings page."""
    s = (await db.execute(select(PaymentSettings).limit(1))).scalar_one_or_none()
    return s.mode.value if s else "test"


async def resolve_razorpay_keys(db: AsyncSession) -> tuple[str, str]:
    """Resolve the Razorpay (key_id, key_secret) for the currently active mode.

    Secrets come from the backend env ONLY (settings.RAZORPAY_TEST_*/LIVE_*);
    the DB stores just the active mode. Raises 503 if that mode's keys are unset.
    """
    mode = await get_active_payment_mode(db)
    key_id, key_secret = settings.razorpay_keys(mode)
    if not key_id or not key_secret:
        raise APIError(
            code="PAYMENT_NOT_CONFIGURED",
            message=f"Online payments are not configured for {mode} mode yet. Please contact support.",
            status_code=503,
        )
    return key_id, key_secret


async def create_razorpay_order(
    db: AsyncSession, *, amount_paise: int, currency: str, receipt: str
) -> tuple[dict, str]:
    razorpay = _require_sdk()
    mode = await get_active_payment_mode(db)
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

    try:
        order = await anyio.to_thread.run_sync(_create)
    except Exception as exc:  # noqa: BLE001 — razorpay.errors.* / transport errors
        # Surface the REAL reason in the server log. The #1 cause of "test works
        # but live doesn't" is an un-activated Razorpay account or a wrong live
        # key — both raise HERE, and previously bubbled up as an opaque 500, so
        # the checkout (and its QR) never opened for the student.
        print(f"[PAYMENT] Razorpay order.create FAILED (mode={mode}): {type(exc).__name__}: {exc}")
        raise APIError(
            code="PAYMENT_GATEWAY_ERROR",
            message="We couldn't start the payment right now. Please try again, or contact support if it continues.",
            status_code=502,
        ) from exc
    return order, key_id


async def test_razorpay_connection(db: AsyncSession) -> dict:
    """Admin diagnostic: create a tiny (₹1) order with the ACTIVE mode's keys to
    confirm they actually work against Razorpay. Creates NO charge — an order is
    only a payment intent that expires unpaid. Returns {ok, mode, order_id?, error?}.
    """
    mode = await get_active_payment_mode(db)
    key_id, key_secret = settings.razorpay_keys(mode)
    if not (key_id and key_secret):
        return {"ok": False, "mode": mode, "error": f"No {mode}-mode keys found in the server environment (.env)."}
    try:
        razorpay = _require_sdk()
    except APIError as exc:
        msg = exc.detail.get("message") if isinstance(exc.detail, dict) else str(exc.detail)
        return {"ok": False, "mode": mode, "error": msg}

    client = razorpay.Client(auth=(key_id, key_secret))

    def _ping():
        return client.order.create(
            {"amount": 100, "currency": "INR", "receipt": "sma_conn_test", "payment_capture": 1}
        )

    try:
        order = await anyio.to_thread.run_sync(_ping)
    except Exception as exc:  # noqa: BLE001
        print(f"[PAYMENT] Connection test FAILED (mode={mode}): {type(exc).__name__}: {exc}")
        return {"ok": False, "mode": mode, "error": f"{type(exc).__name__}: {exc}"}
    return {"ok": True, "mode": mode, "order_id": order.get("id")}


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
