from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------


class WebinarFAQItem(BaseModel):
    order: int = 0
    question: str
    answer: str


# ---------------------------------------------------------------------------
# Organizations (hosts / brands)
# ---------------------------------------------------------------------------


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    logo_url: Optional[str] = None
    description: Optional[str] = None
    website: Optional[str] = None
    contact_email: Optional[str] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    logo_url: Optional[str] = None
    description: Optional[str] = None
    website: Optional[str] = None
    contact_email: Optional[str] = None


# ---------------------------------------------------------------------------
# Webinars
# ---------------------------------------------------------------------------


class WebinarBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    subtitle: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    language: str = "English"
    organization_id: Optional[str] = None

    start_at: datetime
    end_at: datetime
    timezone: str = "Asia/Kolkata"

    registration_open_at: Optional[datetime] = None
    registration_close_at: Optional[datetime] = None
    max_participants: Optional[int] = Field(default=None, ge=1)
    allow_waitlist: bool = False

    is_free: bool = True
    price: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = "INR"

    provider_type: str = "manual_link"
    meeting_url: Optional[str] = None
    meeting_link_public: bool = False

    faqs: list[WebinarFAQItem] = []
    email_settings: Optional[dict] = None

    meta_title: Optional[str] = None
    meta_description: Optional[str] = None


class WebinarCreate(WebinarBase):
    pass


class WebinarUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    subtitle: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    language: Optional[str] = None
    organization_id: Optional[str] = None

    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    timezone: Optional[str] = None

    registration_open_at: Optional[datetime] = None
    registration_close_at: Optional[datetime] = None
    max_participants: Optional[int] = Field(default=None, ge=1)
    allow_waitlist: Optional[bool] = None

    is_free: Optional[bool] = None
    price: Optional[Decimal] = Field(default=None, ge=0)
    currency: Optional[str] = None

    provider_type: Optional[str] = None
    meeting_url: Optional[str] = None
    meeting_link_public: Optional[bool] = None

    faqs: Optional[list[WebinarFAQItem]] = None
    email_settings: Optional[dict] = None

    meta_title: Optional[str] = None
    meta_description: Optional[str] = None


# ---------------------------------------------------------------------------
# Registrations
# ---------------------------------------------------------------------------


class RegistrationCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    date_of_birth: date
    gender: str
    profession: str = Field(min_length=1, max_length=100)
    captcha_token: Optional[str] = None
    referral_source: Optional[str] = None
    utm: Optional[dict] = None


class RegistrationVerify(BaseModel):
    token: str = Field(min_length=8, max_length=64)


class RegistrationResend(BaseModel):
    email: EmailStr
    captcha_token: Optional[str] = None


class RegistrationAdminUpdate(BaseModel):
    attendance_status: Optional[str] = None
    status: Optional[str] = None


# ---------------------------------------------------------------------------
# Email campaigns
# ---------------------------------------------------------------------------


class EmailCampaignCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=500)
    body: str = Field(min_length=1)
    audience: str = "all"
    recipient_ids: Optional[list[str]] = None
