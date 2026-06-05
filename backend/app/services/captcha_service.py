from __future__ import annotations

import httpx

from app.core.config import settings

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(token: str | None, remote_ip: str | None = None) -> bool:
    """Verify a Cloudflare Turnstile token.

    Returns True when Turnstile is not configured (so local/dev and self-hosted
    installs without keys still work). When configured, a missing/invalid token
    returns False.
    """
    if not settings.turnstile_enabled:
        return True

    if not token:
        return False

    data = {"secret": settings.TURNSTILE_SECRET_KEY, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(TURNSTILE_VERIFY_URL, data=data)
        body = resp.json()
        return bool(body.get("success"))
    except Exception as e:  # network / parse failure — fail closed
        print(f"[CAPTCHA][ERROR] Turnstile verification failed: {e}")
        return False
