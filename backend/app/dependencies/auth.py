from __future__ import annotations

from typing import Optional

from fastapi import Cookie, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    err_account_inactive,
    err_insufficient_role,
    err_token_blacklisted,
    err_token_expired,
)
from app.core.redis import is_blacklisted
from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User, UserRole
from app.services.auth_service import get_user_by_id


async def get_current_user(
    access_token: Optional[str] = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not access_token:
        raise err_token_expired()
    payload = decode_token(access_token)
    if not payload or payload.get("type") != "access":
        raise err_token_expired()

    jti = payload.get("jti")
    if jti and await is_blacklisted(jti, "access"):
        raise err_token_blacklisted()

    sub = payload.get("sub")
    if not sub:
        raise err_token_expired()

    user = await get_user_by_id(db, sub)
    if not user:
        raise err_token_expired()
    if not user.is_active:
        raise err_account_inactive()
    return user


def require_role(*roles: UserRole):
    async def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise err_insufficient_role()
        return user

    return dep


require_admin = require_role(UserRole.admin)
require_instructor = require_role(UserRole.instructor)
require_student = require_role(UserRole.student)
require_admin_or_instructor = require_role(UserRole.admin, UserRole.instructor)
