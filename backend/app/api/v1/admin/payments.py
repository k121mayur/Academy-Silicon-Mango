from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.batch import Batch
from app.models.payment import Payment, PaymentMode, PaymentSettings, PaymentStatus
from app.models.user import StudentProfile, User
from app.schemas.payment import PaymentPublic, PaymentSettingsPublic, PaymentSettingsUpdate

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


@router.get("/payment-settings", response_model=PaymentSettingsPublic)
async def get_payment_settings(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    res = await db.execute(select(PaymentSettings).limit(1))
    s = res.scalar_one_or_none()
    if not s:
        return PaymentSettingsPublic(mode="test", key_id_masked=None, has_credentials=False)
    return PaymentSettingsPublic(
        mode=s.mode.value,
        key_id_masked=_mask(s.key_id),
        has_credentials=bool(s.key_id and s.key_secret),
    )


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

    res = await db.execute(select(PaymentSettings).limit(1))
    s = res.scalar_one_or_none()
    if s is None:
        s = PaymentSettings(mode=mode, key_id=payload.key_id, key_secret=payload.key_secret, key_id_masked=_mask(payload.key_id))
        db.add(s)
    else:
        s.mode = mode
        s.key_id = payload.key_id
        s.key_secret = payload.key_secret
        s.key_id_masked = _mask(payload.key_id)
    await db.commit()
    print(f"[ADMIN] Payment settings updated mode={mode.value}")
    return PaymentSettingsPublic(mode=mode.value, key_id_masked=_mask(payload.key_id), has_credentials=True)
