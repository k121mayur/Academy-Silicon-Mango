from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    APIError,
    err_login_rate_limited,
    err_otp_rate_limited,
    err_token_expired,
)
from app.core import oauth as oauth_helpers
from app.core.redis import (
    blacklist_token,
    is_blacklisted,
    login_rate_limit,
    otp_rate_limit,
)
from app.core.security import (
    clear_auth_cookies,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    set_auth_cookies,
    verify_password,
)
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User, UserRole
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    MeResponse,
    MessageResponse,
    OTPRequestResponse,
    SignupRequest,
    SignupVerify,
    UserPublic,
)
from app.services.auth_service import (
    authenticate_user,
    get_or_create_google_user,
    is_profile_complete,
    issue_tokens,
    request_signup_otp,
    verify_signup_otp_and_create,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_public(user: User) -> UserPublic:
    name = None
    avatar = None
    if user.role == UserRole.student and user.student_profile:
        name = user.student_profile.display_name
        avatar = user.student_profile.avatar_url
    elif user.role == UserRole.instructor and user.instructor_profile:
        name = user.instructor_profile.display_name
        avatar = user.instructor_profile.avatar_url
    return UserPublic(
        id=str(user.id),
        email=user.email,
        role=user.role.value,
        display_name=name,
        avatar_url=avatar,
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    ip = request.client.host if request.client else "unknown"
    allowed, reset_in = await login_rate_limit(ip)
    if not allowed:
        raise err_login_rate_limited(reset_in)

    user = await authenticate_user(db, payload.email, payload.password)
    access, refresh = await issue_tokens(user)
    set_auth_cookies(response, access, refresh)

    return AuthResponse(user=_user_public(user), profile_complete=is_profile_complete(user))


@router.post("/signup/request", response_model=OTPRequestResponse)
async def signup_request(payload: SignupRequest, db: AsyncSession = Depends(get_db)):
    allowed, reset_in = await otp_rate_limit(payload.email)
    if not allowed:
        raise err_otp_rate_limited(reset_in)

    expires_in = await request_signup_otp(db, payload.email)
    return OTPRequestResponse(message="OTP sent to your email", expires_in=expires_in)


@router.post("/signup/verify", response_model=AuthResponse)
async def signup_verify(
    payload: SignupVerify,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user = await verify_signup_otp_and_create(
        db,
        email=payload.email,
        otp=payload.otp,
        password=payload.password,
        display_name=payload.display_name,
    )
    access, refresh = await issue_tokens(user)
    set_auth_cookies(response, access, refresh)
    return AuthResponse(user=_user_public(user), profile_complete=is_profile_complete(user))


@router.post("/refresh", response_model=MessageResponse)
async def refresh(
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not refresh_token:
        raise err_token_expired()
    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise err_token_expired()

    jti = payload.get("jti")
    if jti and await is_blacklisted(jti, "refresh"):
        raise err_token_expired()

    sub = payload.get("sub")
    if not sub:
        raise err_token_expired()

    from app.services.auth_service import get_user_by_id

    user = await get_user_by_id(db, sub)
    if not user or not user.is_active:
        raise err_token_expired()

    # Rotate: blacklist old refresh, issue new pair
    if jti:
        from datetime import datetime, timezone

        exp = payload.get("exp", 0)
        now = int(datetime.now(timezone.utc).timestamp())
        ttl = max(exp - now, 1)
        await blacklist_token(jti, ttl, kind="refresh")

    access, _ = create_access_token(sub=str(user.id), role=user.role.value, email=user.email)
    new_refresh, _ = create_refresh_token(sub=str(user.id))
    set_auth_cookies(response, access, new_refresh)
    return MessageResponse(message="Tokens refreshed")


@router.post("/logout", response_model=MessageResponse)
async def logout(
    response: Response,
    access_token: Optional[str] = Cookie(default=None),
    refresh_token: Optional[str] = Cookie(default=None),
):
    from datetime import datetime, timezone

    now = int(datetime.now(timezone.utc).timestamp())

    for token, kind in [(access_token, "access"), (refresh_token, "refresh")]:
        if not token:
            continue
        payload = decode_token(token)
        if payload and payload.get("jti"):
            ttl = max(payload.get("exp", now) - now, 1)
            await blacklist_token(payload["jti"], ttl, kind=kind)

    clear_auth_cookies(response)
    return MessageResponse(message="Logged out")


from pydantic import BaseModel, Field as _PField


class ChangePasswordPayload(BaseModel):
    current_password: str = _PField(min_length=1)
    new_password: str = _PField(min_length=8, max_length=128)


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    payload: ChangePasswordPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.hashed_password:
        raise APIError(
            code="VALIDATION",
            message="This account uses a social login and has no password to change.",
        )
    if not verify_password(payload.current_password, user.hashed_password):
        raise APIError(code="AUTH_BAD_PASSWORD", message="Current password is incorrect")
    if payload.new_password == payload.current_password:
        raise APIError(
            code="VALIDATION",
            message="New password must be different from the current one",
        )
    # Basic strength: at least 1 letter and 1 digit
    if not any(c.isalpha() for c in payload.new_password) or not any(
        c.isdigit() for c in payload.new_password
    ):
        raise APIError(
            code="VALIDATION",
            message="Password must contain at least one letter and one digit",
        )

    user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    return MessageResponse(message="Password changed")


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)):
    pub = _user_public(user)
    return MeResponse(
        id=pub.id,
        email=pub.email,
        role=pub.role,
        display_name=pub.display_name,
        avatar_url=pub.avatar_url,
        profile_complete=is_profile_complete(user),
    )


# -------- Google OAuth --------

@router.get("/google/authorize")
async def google_authorize(response: Response):
    if not settings.google_oauth_enabled:
        raise APIError(code="OAUTH_DISABLED", message="Google OAuth is not configured", status_code=503)

    state = secrets.token_urlsafe(24)
    url = oauth_helpers.build_authorize_url(state)
    if not url:
        raise APIError(code="OAUTH_DISABLED", message="Google OAuth is not configured", status_code=503)

    redirect = RedirectResponse(url, status_code=status.HTTP_302_FOUND)
    redirect.set_cookie(
        "oauth_state",
        state,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=600,
        path="/",
    )
    return redirect


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    oauth_state: Optional[str] = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    frontend = settings.FRONTEND_URL.rstrip("/")

    if error or not code:
        return RedirectResponse(f"{frontend}/login?error=oauth_failed", status_code=302)

    if not state or state != oauth_state:
        return RedirectResponse(f"{frontend}/login?error=oauth_state_mismatch", status_code=302)

    token_data = await oauth_helpers.exchange_code(code)
    if not token_data or "access_token" not in token_data:
        return RedirectResponse(f"{frontend}/login?error=oauth_token_failed", status_code=302)

    userinfo = await oauth_helpers.fetch_userinfo(token_data["access_token"])
    if not userinfo or not userinfo.get("email"):
        return RedirectResponse(f"{frontend}/login?error=oauth_userinfo_failed", status_code=302)

    try:
        user = await get_or_create_google_user(
            db,
            email=userinfo["email"],
            google_id=userinfo.get("sub", ""),
            display_name=userinfo.get("name") or userinfo["email"].split("@")[0],
            avatar_url=userinfo.get("picture"),
        )
    except APIError as e:
        detail = e.detail if isinstance(e.detail, dict) else {}
        code_str = detail.get("code", "oauth_failed")
        return RedirectResponse(f"{frontend}/login?error={code_str}", status_code=302)

    access, refresh = await issue_tokens(user)
    profile_complete = is_profile_complete(user)
    target = "/portal/profile" if not profile_complete else "/portal/dashboard"
    redirect = RedirectResponse(f"{frontend}{target}", status_code=302)
    set_auth_cookies(redirect, access, refresh)
    redirect.delete_cookie("oauth_state", path="/")
    return redirect
