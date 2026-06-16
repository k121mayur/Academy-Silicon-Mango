from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import APIError
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.batch import Batch
from app.models.payment import Payment, PaymentMode, PaymentSettings, PaymentStatus
from app.models.user import StudentProfile, User
from app.schemas.payment import PaymentPublic, PaymentSettingsPublic, PaymentSettingsUpdate
from app.services.payment_service import test_razorpay_connection

router = APIRouter(tags=["admin:payments"])


@router.get("/payments")
async def list_payments(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    base = select(Payment, User, Batch).join(User, User.id == Payment.student_id).join(Batch, Batch.id == Payment.batch_id)
    cnt = select(func.count(Payment.id))
    if status:
        try:
            s = PaymentStatus(status)
            base = base.where(Payment.status == s)
            cnt = cnt.where(Payment.status == s)
        except ValueError:
            pass
    total = (await db.execute(cnt)).scalar_one()
    base = base.order_by(Payment.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(base)).all()
    items = []
    for p, u, b in rows:
        prof_res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == u.id))
        prof = prof_res.scalar_one_or_none()
        items.append(
            PaymentPublic(
                id=str(p.id),
                student_id=str(u.id),
                student_name=prof.display_name if prof else u.email,
                batch_id=str(b.id),
                batch_name=b.name,
                amount=p.amount,
                currency=p.currency,
                status=p.status.value,
                razorpay_order_id=p.razorpay_order_id,
                razorpay_payment_id=p.razorpay_payment_id,
                created_at=p.created_at,
            )
        )
    return {
        "success": True,
        "data": items,
        "meta": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit))},
    }


def _mask(key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    if len(key) <= 8:
        return "*" * len(key)
    return key[:8] + "*" * (len(key) - 12) + key[-4:]


def _settings_public(mode: str) -> PaymentSettingsPublic:
    """Build the admin-facing view: the active mode, whether each mode's keys
    exist in the env, and the masked PUBLIC key id of the active mode. No
    secret ever appears here."""
    active_key_id, _secret = settings.razorpay_keys(mode)
    return PaymentSettingsPublic(
        mode=mode,
        test_configured=settings.razorpay_configured("test"),
        live_configured=settings.razorpay_configured("live"),
        active_key_id_masked=_mask(active_key_id),
    )


@router.get("/payment-settings", response_model=PaymentSettingsPublic)
async def get_payment_settings(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    s = (await db.execute(select(PaymentSettings).limit(1))).scalar_one_or_none()
    return _settings_public(s.mode.value if s else "test")


@router.put("/payment-settings", response_model=PaymentSettingsPublic)
async def update_payment_settings(
    payload: PaymentSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    try:
        mode = PaymentMode(payload.mode)
    except ValueError:
        raise APIError(code="VALIDATION", message="mode must be 'test' or 'live'")

    # Guard: never switch into a mode whose keys aren't on the server, or every
    # student would immediately hit "payments not configured" (503).
    if not settings.razorpay_configured(mode.value):
        raise APIError(
            code="PAYMENT_MODE_NOT_CONFIGURED",
            message=(
                f"Can't switch to {mode.value} mode — its Razorpay keys are not set on "
                f"the server. Add RAZORPAY_{mode.value.upper()}_KEY_ID and "
                f"RAZORPAY_{mode.value.upper()}_KEY_SECRET to the backend .env, restart, "
                f"then try again."
            ),
            status_code=400,
        )

    s = (await db.execute(select(PaymentSettings).limit(1))).scalar_one_or_none()
    if s is None:
        s = PaymentSettings(mode=mode)
        db.add(s)
        try:
            await db.commit()
        except IntegrityError:
            # A concurrent request inserted the singleton row first (blocked by
            # the uq_payment_settings_singleton index). Roll back and update the
            # existing row instead.
            await db.rollback()
            s = (await db.execute(select(PaymentSettings).limit(1))).scalar_one()
            s.mode = mode
            await db.commit()
    else:
        s.mode = mode
        await db.commit()
    print(f"[ADMIN] Payment mode switched to {mode.value}")
    return _settings_public(mode.value)


@router.post("/payment-settings/test")
async def test_payment_connection(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    """Validate the ACTIVE mode's Razorpay keys by creating a ₹1 order (no
    charge). Returns the exact gateway error if it fails — the fastest way to
    tell an un-activated live account from a bad key."""
    return await test_razorpay_connection(db)
