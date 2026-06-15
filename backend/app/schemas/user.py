from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class InstructorCreate(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=255)
    bio: Optional[str] = None
    skills: list[str] = []
    password: Optional[str] = Field(None, min_length=8)


class InstructorUpdate(BaseModel):
    email: Optional[EmailStr] = None
    display_name: Optional[str] = Field(None, min_length=1, max_length=255)
    bio: Optional[str] = None
    skills: Optional[list[str]] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8)


class InstructorPublic(BaseModel):
    id: str
    user_id: str
    email: str
    display_name: str
    bio: Optional[str] = None
    skills: list[str] = []
    avatar_url: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None


class StudentCreate(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8)
    phone: Optional[str] = None
    city: Optional[str] = None
    batch_name: Optional[str] = None
    instructor_name: Optional[str] = None


class StudentPublic(BaseModel):
    id: str
    user_id: str
    email: str
    display_name: str
    phone: Optional[str] = None
    city: Optional[str] = None
    profile_complete: bool = False
    avatar_url: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None


class StudentUpdate(BaseModel):
    email: Optional[EmailStr] = None
    display_name: Optional[str] = Field(None, min_length=1, max_length=255)
    phone: Optional[str] = None
    city: Optional[str] = None
    is_active: Optional[bool] = None


class StudentProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    occupation: Optional[str] = None
    education: Optional[list] = None
    experience: Optional[list] = None
