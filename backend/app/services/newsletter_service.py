from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    err_newsletter_otp_expired,
    err_newsletter_otp_invalid,
    err_newsletter_otp_max_attempts,
)
from app.core.redis import (
    clear_newsletter_otp,
    get_newsletter_otp,
    incr_newsletter_otp_attempts,
    store_newsletter_otp,
)
from app.core.security import generate_otp, hash_otp, verify_otp
from app.models.newsletter import NewsletterSubscriber
from app.services.email_service import queue_email, render_newsletter_otp_email

OTP_TTL_SECONDS = 300
MAX_OTP_ATTEMPTS = 5


def _mask_email(email: str) -> str:
    try:
        local, domain = email.split("@", 1)
    except ValueError:
        return "***"
    prefix = local[:2] if len(local) > 2 else local[:1]
    return f"{prefix}***@{domain}"


async def _get_subscriber(db: AsyncSession, email: str) -> NewsletterSubscriber | None:
    res = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == email.lower())
    )
    return res.scalar_one_or_none()


async def request_newsletter_otp(db: AsyncSession, email: str) -> tuple[int, bool]:
    """Send a confirmation OTP for a newsletter subscription.

    Returns (expires_in_seconds, already_subscribed). When the address is already
    an active subscriber, no email is sent and (0, True) is returned so the caller
    can short-circuit to a friendly "already subscribed" message.
    """
    email = email.lower()

    existing = await _get_subscriber(db, email)
    if existing and existing.is_active and existing.confirmed_at is not None:
        print(f"[NEWSLETTER] Already subscribed: {_mask_email(email)}")
        return 0, True

    otp = generate_otp()
    await store_newsletter_otp(email, hash_otp(otp), ttl_seconds=OTP_TTL_SECONDS)

    subject, html, text = render_newsletter_otp_email(otp, minutes=OTP_TTL_SECONDS // 60)
    queue_email(email, subject, html, text)
    print(f"[NEWSLETTER] Confirmation OTP issued for {_mask_email(email)} (expires in 5 min)")
    return OTP_TTL_SECONDS, False


async def verify_newsletter_otp(db: AsyncSession, email: str, otp: str) -> None:
    """Validate the OTP and confirm (upsert) the subscription."""
    email = email.lower()

    record = await get_newsletter_otp(email)
    if not record or not record.get("code"):
        raise err_newsletter_otp_expired()

    attempts = int(record.get("attempts", "0") or 0)
    if attempts >= MAX_OTP_ATTEMPTS:
        await clear_newsletter_otp(email)
        raise err_newsletter_otp_max_attempts()

    if not verify_otp(otp, record["code"]):
        new_attempts = await incr_newsletter_otp_attempts(email)
        print(f"[NEWSLETTER] Invalid OTP attempt {new_attempts}/{MAX_OTP_ATTEMPTS} for {_mask_email(email)}")
        raise err_newsletter_otp_invalid()

    # Confirmed — upsert the subscriber (re-activate a soft-unsubscribed row).
    now = datetime.now(timezone.utc)
    subscriber = await _get_subscriber(db, email)
    if subscriber is None:
        subscriber = NewsletterSubscriber(
            email=email,
            is_active=True,
            source="landing_footer",
            confirmed_at=now,
            unsubscribed_at=None,
            unsubscribe_reason=None,
        )
        db.add(subscriber)
    else:
        subscriber.is_active = True
        subscriber.unsubscribed_at = None
        subscriber.unsubscribe_reason = None
        if subscriber.confirmed_at is None:
            subscriber.confirmed_at = now
    await db.commit()

    await clear_newsletter_otp(email)
    print(f"[NEWSLETTER] Subscription confirmed for {_mask_email(email)}")


def generate_unsubscribe_token(email: str) -> str:
    """Generate a tamper-proof HMAC token for an email address to use in unsubscribe links."""
    import hashlib
    import hmac
    from app.core.config import settings

    key = settings.SECRET_KEY.encode("utf-8")
    msg = email.strip().lower().encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:32]


def verify_unsubscribe_token(email: str, token: str) -> bool:
    """Verify the HMAC token for an email address."""
    import hmac

    expected = generate_unsubscribe_token(email)
    return hmac.compare_digest(expected, token.strip().lower())


def get_unsubscribe_url(email: str) -> str:
    """Construct an unsubscribe link with email and token query parameters."""
    import urllib.parse
    from app.core.config import settings

    token = generate_unsubscribe_token(email)
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/unsubscribe?email={urllib.parse.quote(email.strip())}&token={token}"


async def unsubscribe_email(
    db: AsyncSession,
    email: str,
    reason: str | None = None,
    token: str | None = None,
) -> bool:
    """Unsubscribe an email from the newsletter and marketing campaigns."""
    clean_email = email.strip().lower()
    if token and not verify_unsubscribe_token(clean_email, token):
        print(f"[NEWSLETTER] Warning: Invalid unsubscribe token provided for {_mask_email(clean_email)}")

    now = datetime.now(timezone.utc)
    subscriber = await _get_subscriber(db, clean_email)
    clean_reason = reason.strip() if reason and reason.strip() else None

    if subscriber is None:
        subscriber = NewsletterSubscriber(
            email=clean_email,
            is_active=False,
            source="unsubscribe_form",
            unsubscribed_at=now,
            unsubscribe_reason=clean_reason,
        )
        db.add(subscriber)
    else:
        subscriber.is_active = False
        subscriber.unsubscribed_at = now
        if clean_reason:
            subscriber.unsubscribe_reason = clean_reason

    await db.commit()
    print(f"[NEWSLETTER] Unsubscribed {_mask_email(clean_email)} (reason: {clean_reason})")
    return True
