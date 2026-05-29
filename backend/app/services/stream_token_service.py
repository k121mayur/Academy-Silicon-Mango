from __future__ import annotations

import base64
import hashlib
import hmac
import time
from dataclasses import dataclass
from typing import Optional

from app.core.config import settings
from app.core.exceptions import APIError


# ──────────────────────────────────────────────────────────────────────────
# nginx-compatible secure_link signing for CDN-cacheable HLS segment URLs.
#
# The signature is USER-AGNOSTIC (no user/IP) so every concurrent viewer gets
# the identical URL → Cloudflare caches it. nginx validates it with:
#     secure_link        $arg_md5,$arg_e;
#     secure_link_md5    "$uri $arg_e <SECRET>";
# i.e. md5_raw("<uri> <e> <secret>") base64url-encoded (no padding). We MUST
# build the exact same string here. Access control lives at the playlist gate
# (login + enrollment + revocation); the signature only proves the URL was
# issued by us and bounds its lifetime.
# ──────────────────────────────────────────────────────────────────────────

def _segment_secret() -> str:
    key = (settings.SEGMENT_SIGNING_SECRET or "").strip()
    if not key:
        raise APIError(
            code="STREAM_CONFIG",
            message="Segment signing secret is not configured.",
            status_code=500,
        )
    return key


def segment_url_expiry(now: Optional[int] = None) -> int:
    """Bucketed absolute expiry (Unix seconds). All viewers within one bucket
    get the same value; the 2-bucket horizon keeps URLs from expiring during a
    segment so playback stays smooth."""
    now = now if now is not None else int(time.time())
    bucket = max(60, settings.SEGMENT_URL_BUCKET_SECONDS)
    return (now // bucket + 2) * bucket


def sign_segment_uri(uri: str, expiry: int) -> str:
    """Return the `md5` value nginx's secure_link_md5 expects for `uri`+`expiry`.

    `uri` must be the exact request path nginx will see ($uri), e.g.
    '/media/seg/<inst>/<vid>/720p/seg_00001.ts' (no query string)."""
    raw = hashlib.md5(f"{uri} {expiry} {_segment_secret()}".encode("utf-8")).digest()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64u_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _secret() -> bytes:
    key = (settings.VIDEO_STREAM_SECRET or "").strip()
    if not key:
        raise APIError(
            code="STREAM_CONFIG",
            message="Video streaming secret is not configured.",
            status_code=500,
        )
    return key.encode("utf-8")


def _sign(payload: str) -> str:
    sig = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).digest()
    return _b64u(sig)


@dataclass
class TokenClaims:
    user_id: str
    video_id: str
    ip: str
    scope: str   # 'manifest' | 'segment:<rendition>/<seg_name>'
    nbf: int
    exp: int


def _build_payload(claims: TokenClaims) -> str:
    return f"{claims.user_id}|{claims.video_id}|{claims.ip}|{claims.scope}|{claims.nbf}|{claims.exp}"


def issue_manifest_token(user_id: str, video_id: str, ip: str, ttl: Optional[int] = None) -> tuple[str, int]:
    now = int(time.time())
    ttl_s = ttl or settings.STREAM_TOKEN_TTL_SECONDS
    claims = TokenClaims(
        user_id=str(user_id),
        video_id=str(video_id),
        ip=ip,
        scope="manifest",
        nbf=now,
        exp=now + ttl_s,
    )
    payload = _build_payload(claims)
    sig = _sign(payload)
    token = f"{_b64u(payload.encode('utf-8'))}.{sig}"
    return token, ttl_s


def issue_segment_token(user_id: str, video_id: str, ip: str, rendition: str, seg_name: str, ttl: Optional[int] = None) -> str:
    now = int(time.time())
    ttl_s = ttl or settings.SEGMENT_TOKEN_TTL_SECONDS
    scope = f"segment:{rendition}/{seg_name}"
    claims = TokenClaims(
        user_id=str(user_id),
        video_id=str(video_id),
        ip=ip,
        scope=scope,
        nbf=now,
        exp=now + ttl_s,
    )
    payload = _build_payload(claims)
    sig = _sign(payload)
    return f"{_b64u(payload.encode('utf-8'))}.{sig}"


def verify(token: str, video_id: str, ip: str, expected_scope: str) -> TokenClaims:
    try:
        payload_b64, sig = token.split(".", 1)
    except ValueError:
        raise APIError(code="STREAM_TOKEN_INVALID", message="Malformed token", status_code=403)

    try:
        payload = _b64u_decode(payload_b64).decode("utf-8")
    except Exception:
        raise APIError(code="STREAM_TOKEN_INVALID", message="Malformed token", status_code=403)

    parts = payload.split("|")
    if len(parts) != 6:
        raise APIError(code="STREAM_TOKEN_INVALID", message="Malformed token", status_code=403)

    user_id, tok_video_id, tok_ip, tok_scope, nbf_s, exp_s = parts
    try:
        nbf = int(nbf_s)
        exp = int(exp_s)
    except ValueError:
        raise APIError(code="STREAM_TOKEN_INVALID", message="Malformed token", status_code=403)

    expected_sig = _sign(payload)
    if not hmac.compare_digest(expected_sig, sig):
        raise APIError(code="STREAM_TOKEN_INVALID", message="Token signature mismatch", status_code=403)

    now = int(time.time())
    if now < nbf or now > exp:
        raise APIError(code="STREAM_TOKEN_EXPIRED", message="Token expired", status_code=403)

    if tok_video_id != str(video_id):
        raise APIError(code="STREAM_TOKEN_INVALID", message="Token does not match video", status_code=403)

    if tok_ip != ip:
        raise APIError(code="STREAM_TOKEN_IP_MISMATCH", message="Token does not match client IP", status_code=403)

    if tok_scope != expected_scope:
        raise APIError(code="STREAM_TOKEN_SCOPE", message="Token scope mismatch", status_code=403)

    return TokenClaims(
        user_id=user_id, video_id=tok_video_id, ip=tok_ip, scope=tok_scope, nbf=nbf, exp=exp
    )
