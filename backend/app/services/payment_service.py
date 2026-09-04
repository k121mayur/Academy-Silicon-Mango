from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional
from zoneinfo import ZoneInfo

import anyio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import APIError
from app.models.batch import Batch, BatchStatus, Enrollment, EnrollmentStatus
from app.models.course import Course, DurationUnit
from app.models.payment import Payment, PaymentSettings, PaymentStatus
from app.models.user import User


# Batch dates are India-local; evaluate "today" in IST so the window doesn't flip a
# day early/late on a UTC server around midnight.
IST = ZoneInfo("Asia/Kolkata")


def enrollment_window_end(course: Optional[Course], batch: Batch) -> date:
    """Last day (inclusive) a student may self-enroll in this batch.
    
    Enrollment closes after the first day of the course (batch.start_date) passes.
    """
    return batch.start_date


def is_enrollment_open(
    course: Optional[Course],
    batch: Batch,
    enrolled_count: Optional[int] = None,
) -> bool:
    """Enrollment is open only if:
    1. Batch is not locked and status is upcoming or active.
    2. Admin has not stopped enrollment (is_enrollment_closed is False).
    3. The first day of the course has not passed (today <= batch.start_date).
    4. The batch is not full (if capacity and enrolled_count are checked).
    """
    if batch.is_locked:
        return False
    if batch.status not in (BatchStatus.upcoming, BatchStatus.active):
        return False
    if getattr(batch, "is_enrollment_closed", False):
        return False
    today = datetime.now(IST).date()
    if batch.start_date and today > batch.start_date:
        return False
    if batch.capacity is not None and enrolled_count is not None:
        if enrolled_count >= batch.capacity:
            return False
    return True


# ---- enrollment / capacity helpers (shared by admin-enroll and self-enroll) ----

async def active_enrollment_count(db: AsyncSession, batch_id) -> int:
    return (
        await db.execute(
            select(func.count(Enrollment.id)).where(
                Enrollment.batch_id == batch_id, Enrollment.status == EnrollmentStatus.active
            )
        )
    ).scalar_one()


async def acquire_seat_or_raise(db: AsyncSession, batch: Batch) -> None:
    """Race-free capacity gate for the IMMEDIATE-insert path (free / dev-mock enroll).

    Locks the batch row (FOR UPDATE), then counts, so two distinct students can't
    both pass the check and take the last seat — the unique constraint only stops
    the SAME student twice. The lock is held until the caller commits, which here
    is a few statements later (no network in between), so contention is minimal.
    """
    if batch.capacity is None:
        return
    await db.execute(select(Batch.id).where(Batch.id == batch.id).with_for_update())
    cnt = await active_enrollment_count(db, batch.id)
    if cnt >= batch.capacity:
        raise APIError(code="BATCH_FULL", message="This batch is full", status_code=409)


async def get_existing_enrollment(db: AsyncSession, batch_id, student_id) -> Optional[Enrollment]:
    return (
        await db.execute(
            select(Enrollment).where(
                Enrollment.batch_id == batch_id, Enrollment.student_id == student_id
            )
        )
    ).scalar_one_or_none()


async def get_existing_active_course_enrollment(
    db: AsyncSession, course_id, student_id
) -> Optional[Enrollment]:
    """Any OTHER batch of the same course the student is currently active in.

    Batch-level duplicates are already caught by get_existing_enrollment(); this
    closes the course-level gap (same student, two different batches of one course).
    Dropped/completed enrollments don't match, so re-enrolling into a batch a
    student previously left stays unaffected.
    """
    return (
        await db.execute(
            select(Enrollment)
            .join(Batch, Batch.id == Enrollment.batch_id)
            .where(
                Batch.course_id == course_id,
                Enrollment.student_id == student_id,
                Enrollment.status == EnrollmentStatus.active,
            )
        )
    ).scalars().first()


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
    if await get_existing_active_course_enrollment(db, batch.course_id, student.id):
        raise APIError(
            code="ALREADY_ENROLLED_COURSE",
            message="You are already enrolled in another batch of this course",
            status_code=409,
        )
    if batch.is_locked:
        raise APIError(code="BATCH_003", message="This batch is locked", status_code=409)
    if batch.status not in (BatchStatus.upcoming, BatchStatus.active):
        raise APIError(
            code="BATCH_NOT_OPEN", message="This batch is not open for enrollment", status_code=409
        )
    if getattr(batch, "is_enrollment_closed", False):
        raise APIError(
            code="ENROLL_STOPPED",
            message="Enrollments for this batch have been stopped by the administrator.",
            status_code=409,
        )
    today = datetime.now(IST).date()
    if batch.start_date and today > batch.start_date:
        raise APIError(
            code="ENROLL_CLOSED",
            message="Enrollment for this batch has closed as the course has already started.",
            status_code=409,
        )
    if batch.capacity is not None:
        cnt = await active_enrollment_count(db, batch.id)
        if cnt >= batch.capacity:
            raise APIError(code="BATCH_FULL", message="This batch is full", status_code=409)
    course = await db.get(Course, batch.course_id)
    if not course:
        raise APIError(code="NOT_FOUND", message="Course not found", status_code=404)
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
    is_test: bool = False,
) -> tuple[Enrollment, Payment]:
    """Shared creator — admin-enroll and self-enroll both converge here. Caller commits.

    `is_test=True` marks a QA/dummy enrollment (e.g. admin enrolling into an
    unpublished course) so it is excluded from revenue reporting.
    """
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
        is_test=is_test,
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
