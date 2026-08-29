from __future__ import annotations

import math
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError
from app.db.session import get_db
from app.dependencies.auth import (
    get_current_user,
    get_current_user_optional,
    require_admin_or_instructor,
)
from app.models.review import Review, ReviewComment
from app.models.user import User, UserRole
from app.schemas.review import (
    ReviewCommentCreate,
    ReviewCommentPublic,
    ReviewCreate,
    ReviewPublic,
    ReviewStats,
)

router = APIRouter(prefix="/public/reviews", tags=["public:reviews"])


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
async def list_reviews(
    rating: Optional[int] = Query(None, ge=1, le=5),
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    # Base query for approved reviews
    base_cond = Review.is_approved == True  # noqa: E712

    # 1. Compute overall statistics across all approved reviews
    stats_stmt = (
        select(
            func.count(Review.id).label("total"),
            func.coalesce(func.avg(Review.rating), 5.0).label("avg_rating"),
        )
        .where(base_cond)
    )
    stats_res = (await db.execute(stats_stmt)).one()
    total_reviews = int(stats_res.total or 0)
    avg_rating = round(float(stats_res.avg_rating or 5.0), 1)

    # Breakdown by star
    star_counts_stmt = (
        select(Review.rating, func.count(Review.id))
        .where(base_cond)
        .group_by(Review.rating)
    )
    star_counts_rows = (await db.execute(star_counts_stmt)).all()
    star_counts = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
    for r_val, count in star_counts_rows:
        star_counts[str(r_val)] = count

    # 2. Filtered query
    stmt = select(Review).where(base_cond)
    count_stmt = select(func.count(Review.id)).where(base_cond)

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

    filtered_total = (await db.execute(count_stmt)).scalar_one()

    # Sort newest first
    stmt = stmt.order_by(Review.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()

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
            "total": filtered_total,
            "pages": max(1, math.ceil(filtered_total / limit)),
        },
    }


@router.post("", response_model=ReviewPublic)
async def submit_review(
    payload: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
):
    # Compulsory fields check
    if not (1 <= payload.rating <= 5):
        raise APIError(code="VALIDATION_ERROR", message="Rating must be between 1 and 5 stars", status_code=422)
    if not payload.name.strip():
        raise APIError(code="VALIDATION_ERROR", message="Name is compulsory", status_code=422)
    if not payload.designation.strip():
        raise APIError(code="VALIDATION_ERROR", message="Designation is compulsory", status_code=422)
    if not payload.company_or_institution.strip():
        raise APIError(
            code="VALIDATION_ERROR",
            message="Company or Institution is compulsory",
            status_code=422,
        )
    if not payload.review_text.strip():
        raise APIError(code="VALIDATION_ERROR", message="Review text is compulsory", status_code=422)

    review = Review(
        rating=payload.rating,
        name=payload.name.strip(),
        designation=payload.designation.strip(),
        company_or_institution=payload.company_or_institution.strip(),
        review_text=payload.review_text.strip(),
        user_id=user.id if user else None,
        is_approved=True,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)

    return _to_public(review)


@router.post("/{review_id}/comments", response_model=ReviewCommentPublic)
async def add_review_comment(
    review_id: str,
    payload: ReviewCommentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_instructor),
):
    review = await db.get(Review, review_id)
    if not review:
        raise APIError(code="NOT_FOUND", message="Review not found", status_code=404)

    if not payload.comment_text.strip():
        raise APIError(code="VALIDATION_ERROR", message="Comment text cannot be empty", status_code=422)

    # Determine display name for the commenter
    if user.role == UserRole.instructor and user.instructor_profile:
        author_name = user.instructor_profile.display_name
    elif user.role == UserRole.admin:
        author_name = "Silicon Mango Team"
    else:
        author_name = user.email.split("@")[0].capitalize()

    comment = ReviewComment(
        review_id=review.id,
        user_id=user.id,
        user_name=author_name,
        user_role=user.role.value,
        comment_text=payload.comment_text.strip(),
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    return _to_comment_public(comment)


@router.delete("/{review_id}/comments/{comment_id}")
async def delete_review_comment(
    review_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment = await db.get(ReviewComment, comment_id)
    if not comment or str(comment.review_id) != review_id:
        raise APIError(code="NOT_FOUND", message="Comment not found", status_code=404)

    # Admins can delete any comment; instructors can delete their own comments
    if user.role != UserRole.admin and comment.user_id != user.id:
        raise APIError(code="FORBIDDEN", message="Permission denied", status_code=403)

    await db.delete(comment)
    await db.commit()
    return {"success": True, "message": "Comment deleted"}
