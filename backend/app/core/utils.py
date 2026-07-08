from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo


def get_client_ip(request: Any) -> str:
    """Best-effort real client IP, correct when behind Cloudflare + nginx.

    Cloudflare sets `CF-Connecting-IP` to the true visitor IP; nginx forwards it
    plus `X-Forwarded-For`. We trust these because the origin is locked down to
    only accept Cloudflare traffic (see DEPLOYMENT.md / nginx origin-pull). Order:
    CF-Connecting-IP → first X-Forwarded-For hop → direct peer.
    """
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    text = re.sub(r"[-\s]+", "-", text)
    return text or "untitled"


# Mirrors the IST pattern in app/services/payment_service.py:28 — kept as its own
# constant here rather than imported from there, since app.core must not depend
# on app.services (layering).
IST = ZoneInfo("Asia/Kolkata")


def ist_calendar_range(key: Optional[str]) -> Optional[tuple[datetime, datetime]]:
    """[start, end) UTC-aware bounds for a named IST calendar-day bucket.

    "7d"/"30d" are calendar-anchored and inclusive of today (today back through
    the 6/29 preceding IST calendar days), not a rolling 24h*N window from now.
    Returns None for falsy/unrecognized keys; callers should skip filtering.
    """
    if not key:
        return None
    today_start = datetime.now(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    if key == "today":
        return today_start, today_start + timedelta(days=1)
    if key == "yesterday":
        return today_start - timedelta(days=1), today_start
    if key == "7d":
        return today_start - timedelta(days=6), today_start + timedelta(days=1)
    if key == "30d":
        return today_start - timedelta(days=29), today_start + timedelta(days=1)
    return None
