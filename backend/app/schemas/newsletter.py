from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator


class NewsletterRequest(BaseModel):
    email: EmailStr


class NewsletterVerify(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)

    @field_validator("otp")
    @classmethod
    def numeric_otp(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("OTP must be 6 digits")
        return v


class NewsletterRequestResponse(BaseModel):
    message: str
    # True when the address was already confirmed — the frontend can skip the
    # OTP step and show "already subscribed" instead.
    already_subscribed: bool = False
    expires_in: int = 300


class NewsletterVerifyResponse(BaseModel):
    message: str
    subscribed: bool = True


class NewsletterSubscriberPublic(BaseModel):
    id: str
    email: str
    is_active: bool
    source: str | None = None
    confirmed_at: str | None = None
    unsubscribed_at: str | None = None
    unsubscribe_reason: str | None = None
    created_at: str | None = None


class NewsletterSubscriberCreate(BaseModel):
    email: EmailStr
    source: str | None = "admin_manual"


class NewsletterSubscriberUpdate(BaseModel):
    is_active: bool | None = None
    source: str | None = None
    unsubscribe_reason: str | None = None


class NewsletterSubscriberStats(BaseModel):
    total: int
    active: int
    inactive: int


class UnsubscribeRequest(BaseModel):
    email: EmailStr
    reason: str | None = Field(None, max_length=500)
    token: str | None = None


class UnsubscribeResponse(BaseModel):
    message: str
    unsubscribed: bool = True
