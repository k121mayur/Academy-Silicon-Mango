from __future__ import annotations

import math
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.review import Review, ReviewComment
from app.models.user import User
from app.schemas.review import (
    ReviewCommentPublic,
    ReviewPublic,
    ReviewStats,
)

router = APIRouter(prefix="/reviews", tags=["admin:reviews"])


def _to_comment_public(c: ReviewComment) -> ReviewCommentPublic:
    return ReviewCommentPublic(
        id=str(c.id),
        review_id=str(c.review_id),
        user_id=str(c.user_id) if c.user_id else None,
        user_name=c.user_name,
        user_role=c.user_role,
        comment_text=c.comment_text,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


def _to_public(r: Review) -> ReviewPublic:
    return ReviewPublic(
        id=str(r.id),
        rating=r.rating,
        name=r.name,
        designation=r.designation,
        company_or_institution=r.company_or_institution,
        review_text=r.review_text,
        user_id=str(r.user_id) if r.user_id else None,
        is_approved=r.is_approved,
        created_at=r.created_at,
        updated_at=r.updated_at,
        comments=[_to_comment_public(c) for c in (r.comments or [])],
    )


@router.get("")
async def list_admin_reviews(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    rating: Optional[int] = Query(None, ge=1, le=5),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    stmt = select(Review)
    count_stmt = select(func.count(Review.id))

    if rating is not None:
        stmt = stmt.where(Review.rating == rating)
        count_stmt = count_stmt.where(Review.rating == rating)

    if search and search.strip():
        like = f"%{search.strip()}%"
        cond = or_(
            Review.name.ilike(like),
            Review.designation.ilike(like),
            Review.company_or_institution.ilike(like),
            Review.review_text.ilike(like),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(Review.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()

    # Overall stats
    stats_stmt = select(
        func.count(Review.id).label("total"),
        func.coalesce(func.avg(Review.rating), 5.0).label("avg_rating"),
    )
    stats_res = (await db.execute(stats_stmt)).one()
    total_reviews = int(stats_res.total or 0)
    avg_rating = round(float(stats_res.avg_rating or 5.0), 1)

    star_counts_stmt = select(Review.rating, func.count(Review.id)).group_by(Review.rating)
    star_counts_rows = (await db.execute(star_counts_stmt)).all()
    star_counts = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
    for r_val, count in star_counts_rows:
        star_counts[str(r_val)] = count

    return {
        "success": True,
        "data": [_to_public(r) for r in rows],
        "stats": ReviewStats(
            total_reviews=total_reviews,
            average_rating=avg_rating,
            star_counts=star_counts,
        ),
        "meta": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": max(1, math.ceil(total / limit)),
        },
    }


@router.delete("/{review_id}")
async def delete_review(
    review_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    review = await db.get(Review, review_id)
    if not review:
        raise APIError(code="NOT_FOUND", message="Review not found", status_code=404)

    await db.delete(review)
    await db.commit()
    return {"success": True, "message": "Review deleted"}
