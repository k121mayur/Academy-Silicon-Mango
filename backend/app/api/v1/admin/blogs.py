from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError
from app.core.utils import slugify
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.blog import Blog, BlogStatus
from app.models.user import User
from app.schemas.blog import BlogCreate, BlogPublic, BlogUpdate
from app.services.storage_service import save_upload

router = APIRouter(prefix="/blogs", tags=["admin:blogs"])


def _to_public(b: Blog) -> BlogPublic:
    return BlogPublic(
        id=str(b.id),
        title=b.title,
        slug=b.slug,
        content=b.content,
        excerpt=b.excerpt,
        author=b.author,
        tags=b.tags or [],
        thumbnail_url=b.thumbnail_url,
        status=b.status.value,
        is_published=b.is_published,
        view_count=b.view_count,
        created_at=b.created_at,
        updated_at=b.updated_at,
        published_at=b.published_at,
    )


async def _unique_slug(db: AsyncSession, base_slug: str, exclude_id: Optional[str] = None) -> str:
    slug = base_slug
    suffix = 1
    while True:
        stmt = select(Blog.id).where(Blog.slug == slug)
        if exclude_id:
            stmt = stmt.where(Blog.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if not existing:
            return slug
        suffix += 1
        slug = f"{base_slug}-{suffix}"


@router.get("")
async def list_blogs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = Query(None, description="draft | published"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    stmt = select(Blog)
    count_stmt = select(func.count(Blog.id))

    if search:
        like = f"%{search}%"
        cond = or_(
            Blog.title.ilike(like),
            Blog.author.ilike(like),
            Blog.slug.ilike(like),
            Blog.excerpt.ilike(like),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    if status:
        try:
            st = BlogStatus(status)
            stmt = stmt.where(Blog.status == st)
            count_stmt = count_stmt.where(Blog.status == st)
        except ValueError:
            pass

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(Blog.created_at.desc()).offset((page - 1) * limit).limit(limit)
    blogs = (await db.execute(stmt)).scalars().all()

    items = [_to_public(b) for b in blogs]
    return {
        "success": True,
        "data": items,
        "meta": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit))},
    }


@router.post("", response_model=BlogPublic)
async def create_blog(
    payload: BlogCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    base = slugify(payload.title)
    slug = await _unique_slug(db, base)

    blog = Blog(
        title=payload.title.strip(),
        slug=slug,
        content=payload.content,
        excerpt=payload.excerpt,
        author=payload.author.strip(),
        tags=payload.tags,
        thumbnail_url=payload.thumbnail_url,
        status=BlogStatus.published if payload.is_published else BlogStatus.draft,
        is_published=payload.is_published,
        view_count=0,
        created_by=user.id,
    )
    if payload.is_published:
        blog.published_at = datetime.now(timezone.utc)

    db.add(blog)
    await db.commit()
    await db.refresh(blog)
    print(f"[ADMIN] Blog created: {blog.title} ({blog.slug})")
    return _to_public(blog)


@router.get("/{blog_id}", response_model=BlogPublic)
async def get_blog(blog_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    blog = await db.get(Blog, blog_id)
    if not blog:
        raise APIError(code="NOT_FOUND", message="Blog not found", status_code=404)
    return _to_public(blog)


@router.put("/{blog_id}", response_model=BlogPublic)
async def update_blog(
    blog_id: str,
    payload: BlogUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    blog = await db.get(Blog, blog_id)
    if not blog:
        raise APIError(code="NOT_FOUND", message="Blog not found", status_code=404)

    data = payload.model_dump(exclude_unset=True)

    # Regenerate slug only when the title actually changes.
    if "title" in data and data["title"] != blog.title:
        blog.slug = await _unique_slug(db, slugify(data["title"]), exclude_id=str(blog.id))

    # Publish transition: keep status + is_published in sync; stamp published_at
    # the first time it goes live (never overwrite an existing published_at).
    if "is_published" in data:
        now_published = bool(data.pop("is_published"))
        blog.is_published = now_published
        blog.status = BlogStatus.published if now_published else BlogStatus.draft
        if now_published and blog.published_at is None:
            blog.published_at = datetime.now(timezone.utc)

    for k, v in data.items():
        if hasattr(blog, k):
            setattr(blog, k, v)

    await db.commit()
    await db.refresh(blog)
    print(f"[ADMIN] Blog updated: {blog.title}")
    return _to_public(blog)


@router.delete("/{blog_id}")
async def delete_blog(blog_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    blog = await db.get(Blog, blog_id)
    if not blog:
        raise APIError(code="NOT_FOUND", message="Blog not found", status_code=404)
    await db.delete(blog)
    await db.commit()
    print(f"[ADMIN] Blog deleted: {blog.slug}")
    return {"success": True, "message": "Deleted"}


@router.patch("/{blog_id}/publish", response_model=BlogPublic)
async def toggle_publish(blog_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    blog = await db.get(Blog, blog_id)
    if not blog:
        raise APIError(code="NOT_FOUND", message="Blog not found", status_code=404)
    blog.is_published = not blog.is_published
    blog.status = BlogStatus.published if blog.is_published else BlogStatus.draft
    if blog.is_published and blog.published_at is None:
        blog.published_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(blog)
    print(f"[ADMIN] Blog publish toggled: {blog.slug} -> {blog.status.value}")
    return _to_public(blog)


@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Shared upload endpoint for BOTH the blog thumbnail and inline rich-text
    images. Returns the stored URL; the editor inserts it into the HTML, or the
    admin form sets it as thumbnail_url. Not tied to a specific blog id, so it can
    be called before the blog row exists (during creation)."""
    url = await save_upload(file, "blog_images")
    print(f"[ADMIN] Blog image uploaded: {url}")
    return {"success": True, "data": {"url": url}}
