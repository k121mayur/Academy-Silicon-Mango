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
