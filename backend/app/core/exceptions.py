from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException, status


class APIError(HTTPException):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Optional[Any] = None,
    ):
        super().__init__(
            status_code=status_code,
            detail={"code": code, "message": message, "details": details},
        )


def err_invalid_credentials() -> APIError:
    return APIError(code="AUTH_001", message="Invalid email or password", status_code=401)


def err_provider_mismatch_email() -> APIError:
    return APIError(
        code="AUTH_002",
        message="This account uses email/password login. Please sign in with your credentials.",
        status_code=400,
    )


def err_provider_mismatch_google() -> APIError:
    return APIError(
        code="AUTH_003",
        message="This account uses Google Sign-In. Please continue with Google.",
        status_code=400,
    )


def err_otp_expired() -> APIError:
    return APIError(code="AUTH_004", message="OTP expired. Please request a new one.", status_code=400)


def err_otp_invalid() -> APIError:
    return APIError(code="AUTH_005", message="Invalid OTP code.", status_code=400)


def err_otp_max_attempts() -> APIError:
    return APIError(code="AUTH_006", message="Too many invalid attempts. Please request a new OTP.", status_code=400)


def err_otp_rate_limited(retry_in: int) -> APIError:
    return APIError(
        code="AUTH_007",
        message=f"Too many OTP requests. Try again in {retry_in // 60} minutes.",
        status_code=429,
        details={"retry_after": retry_in},
    )


def err_token_expired() -> APIError:
    return APIError(code="AUTH_008", message="Token expired", status_code=401)


def err_token_blacklisted() -> APIError:
    return APIError(code="AUTH_009", message="Token has been revoked", status_code=401)


def err_insufficient_role() -> APIError:
    return APIError(code="AUTH_010", message="Insufficient permissions", status_code=403)


def err_account_inactive() -> APIError:
    return APIError(code="AUTH_011", message="Your account has been deactivated. Contact support.", status_code=403)


def err_email_exists() -> APIError:
    return APIError(code="USER_001", message="An account with this email already exists.", status_code=400)


def err_user_not_found() -> APIError:
    return APIError(code="USER_002", message="User not found", status_code=404)


def err_login_rate_limited(retry_in: int) -> APIError:
    return APIError(
        code="AUTH_007",
        message=f"Too many login attempts. Try again in {max(retry_in // 60, 1)} minutes.",
        status_code=429,
        details={"retry_after": retry_in},
    )


def err_newsletter_otp_expired() -> APIError:
    return APIError(
        code="NEWS_001",
        message="Your confirmation code expired. Please request a new one.",
        status_code=400,
    )


def err_newsletter_otp_invalid() -> APIError:
    return APIError(code="NEWS_002", message="Invalid confirmation code.", status_code=400)


def err_newsletter_otp_max_attempts() -> APIError:
    return APIError(
        code="NEWS_003",
        message="Too many invalid attempts. Please request a new code.",
        status_code=400,
    )
