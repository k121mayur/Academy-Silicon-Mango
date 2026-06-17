from __future__ import annotations

import uuid as uuid_lib
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Text, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError
from app.db.session import get_db
from app.models.blog import Blog

router = APIRouter(prefix="/public/blogs", tags=["public:blogs"])


def _card_dict(b: Blog) -> dict:
    return {
        "id": str(b.id),
        "title": b.title,
        "slug": b.slug,
        "excerpt": b.excerpt,
        "author": b.author,
        "tags": b.tags or [],
        "thumbnail_url": b.thumbnail_url,
        "published_at": b.published_at.isoformat() if b.published_at else None,
        "view_count": b.view_count,
    }


def _detail_dict(b: Blog) -> dict:
    base = _card_dict(b)
    base.update(
        {
            "content": b.content,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "updated_at": b.updated_at.isoformat() if b.updated_at else None,
        }
    )
    return base


async def _resolve_blog(db: AsyncSession, id_or_slug: str) -> Blog:
    blog: Optional[Blog] = None
    try:
        uuid_lib.UUID(id_or_slug)
        blog = await db.get(Blog, id_or_slug)
    except (ValueError, TypeError):
        blog = (
            await db.execute(select(Blog).where(Blog.slug == id_or_slug))
        ).scalar_one_or_none()
    if not blog or not blog.is_published:
        raise APIError(code="NOT_FOUND", message="Blog not found", status_code=404)
    return blog


@router.get("")
async def list_blogs(
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Blog).where(Blog.is_published == True)  # noqa: E712

    if search and search.strip():
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Blog.title.ilike(like),
                Blog.excerpt.ilike(like),
                Blog.content.ilike(like),
                Blog.author.ilike(like),
                Blog.slug.ilike(like),
                # Tags are JSONB → cast to text so a stored ["AI","ML"] is ILIKE-matched.
                cast(Blog.tags, Text).ilike(like),
            )
        )

    # Newest published first. created_at is the tiebreaker / fallback for any row
    # published before published_at was stamped (NULLS LAST keeps them last).
    stmt = stmt.order_by(Blog.published_at.desc().nullslast(), Blog.created_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()

    return {"success": True, "data": [_card_dict(b) for b in rows]}


@router.get("/{id_or_slug}")
async def blog_detail(id_or_slug: str, db: AsyncSession = Depends(get_db)):
    blog = await _resolve_blog(db, id_or_slug)
    # Best-effort view increment (atomic UPDATE, no read-modify-write race).
    blog.view_count = Blog.view_count + 1
    await db.commit()
    await db.refresh(blog)
    return {"success": True, "data": _detail_dict(blog)}
