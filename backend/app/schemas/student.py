from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class EducationItem(BaseModel):
    qualification: str = Field(min_length=1, max_length=255)
    institution: str = Field(min_length=1, max_length=255)
    field_of_study: str = Field(min_length=1, max_length=255)
    completion_year: str = Field(min_length=1, max_length=20)


class ExperienceItem(BaseModel):
    organisation: str = Field(min_length=1, max_length=255)
    post: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)


class StudentProfileUpdateIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: Optional[str] = Field(None, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    mobile: str = Field(min_length=10, max_length=15)
    city: str = Field(min_length=1, max_length=100)
    occupation: Literal["student", "employee"]
    education: list[EducationItem] = Field(min_length=1)
    experience: list[ExperienceItem] = Field(default_factory=list)

    @field_validator("mobile")
    @classmethod
    def normalize_mobile(cls, v: str) -> str:
        """Store the bare 10-digit number. The +91 prefix is a UI concern."""
        digits = "".join(ch for ch in v if ch.isdigit())
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        if len(digits) != 10 or digits[0] not in "6789":
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return digits

    @model_validator(mode="after")
    def require_experience_if_employee(self):
        if self.occupation == "employee" and len(self.experience) < 1:
            raise ValueError("At least one experience entry is required when occupation is Employee")
        return self


class CreateOrderIn(BaseModel):
    batch_id: str
    mock: bool = False


class VerifyPaymentIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    batch_id: str


class StudentProfileOut(BaseModel):
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    email: str
    mobile: Optional[str] = None
    city: Optional[str] = None
    occupation: Optional[str] = None
    education: list = []
    experience: list = []
    avatar_url: Optional[str] = None
    profile_complete: bool = False
