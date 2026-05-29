from __future__ import annotations

import re
import unicodedata
from typing import Any


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
