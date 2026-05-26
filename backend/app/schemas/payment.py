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
    mode: str  # test | live
    key_id: str
    key_secret: str


class PaymentSettingsPublic(BaseModel):
    mode: str
    key_id_masked: Optional[str] = None
    has_credentials: bool = False
