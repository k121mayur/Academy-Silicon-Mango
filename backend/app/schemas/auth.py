from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class SignupRequest(BaseModel):
    email: EmailStr


class SignupVerify(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=255)

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v

    @field_validator("otp")
    @classmethod
    def numeric_otp(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("OTP must be 6 digits")
        return v


class UserPublic(BaseModel):
    id: str
    email: str
    role: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


class AuthResponse(BaseModel):
    user: UserPublic
    profile_complete: bool


class MeResponse(BaseModel):
    id: str
    email: str
    role: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    profile_complete: bool


class OTPRequestResponse(BaseModel):
    message: str
    expires_in: int = 300


class MessageResponse(BaseModel):
    message: str
