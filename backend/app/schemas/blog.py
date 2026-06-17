from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class BlogBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)  # rich-text HTML
    excerpt: Optional[str] = None
    author: str = Field(min_length=1, max_length=255)
    tags: list[str] = []
    thumbnail_url: Optional[str] = Field(default=None, max_length=1000)


class BlogCreate(BlogBase):
    # Allow creating directly as published; defaults to draft.
    is_published: bool = False


class BlogUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    content: Optional[str] = Field(default=None, min_length=1)
    excerpt: Optional[str] = None
    author: Optional[str] = Field(default=None, min_length=1, max_length=255)
    tags: Optional[list[str]] = None
    thumbnail_url: Optional[str] = Field(default=None, max_length=1000)
    is_published: Optional[bool] = None


class BlogPublic(BaseModel):
    """Full admin/detail shape."""

    id: str
    title: str
    slug: str
    content: str
    excerpt: Optional[str] = None
    author: str
    tags: list[str] = []
    thumbnail_url: Optional[str] = None
    status: str = "draft"
    is_published: bool = False
    view_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
