from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ReviewCommentCreate(BaseModel):
    comment_text: str = Field(min_length=1, max_length=2000, description="Comment or reply content")


class ReviewCommentPublic(BaseModel):
    id: str
    review_id: str
    user_id: Optional[str] = None
    user_name: str
    user_role: str  # 'admin' or 'instructor'
    comment_text: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5, description="Compulsory star rating (1 to 5)")
    name: str = Field(min_length=1, max_length=255, description="Compulsory reviewer name")
    designation: str = Field(min_length=1, max_length=255, description="Compulsory designation / role")
    company_or_institution: str = Field(
        min_length=1, max_length=255, description="Compulsory company or institution"
    )
    review_text: str = Field(min_length=1, max_length=5000, description="Compulsory review content")


class ReviewPublic(BaseModel):
    id: str
    rating: int
    name: str
    designation: str
    company_or_institution: str
    review_text: str
    user_id: Optional[str] = None
    is_approved: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    comments: list[ReviewCommentPublic] = []


class ReviewStats(BaseModel):
    total_reviews: int
    average_rating: float
    star_counts: dict[str, int]
