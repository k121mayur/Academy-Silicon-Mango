from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class PaymentPublic(BaseModel):
    id: str
    student_id: str
    student_name: Optional[str] = None
    batch_id: str
    batch_name: Optional[str] = None
    amount: Decimal
    currency: str = "INR"
    status: str
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    created_at: Optional[datetime] = None


class PaymentSettingsUpdate(BaseModel):
    mode: str  # 'test' | 'live' — keys are NOT accepted here; they live in env.


class PaymentSettingsPublic(BaseModel):
    mode: str
    test_configured: bool = False   # test keys present in the server env?
    live_configured: bool = False   # live keys present in the server env?
    active_key_id_masked: Optional[str] = None  # public key id of the active mode
