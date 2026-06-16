from __future__ import annotations

import time
from typing import Optional

import redis.asyncio as aioredis

from app.core.config import settings

_redis_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        try:
            await _redis_client.ping()
            print("[REDIS] Connected successfully")
        except Exception as e:
            print(f"[REDIS] Connection failed: {e}")
            raise
    return _redis_client


async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
        print("[REDIS] Connection closed")


# ---------------- Token Blacklist ----------------

async def blacklist_token(jti: str, ttl_seconds: int, kind: str = "access") -> None:
    r = await get_redis()
    key = f"blacklist:{kind}:{jti}"
    await r.set(key, "1", ex=max(ttl_seconds, 1))
    print(f"[REDIS] Blacklisted {kind} token jti={jti} ttl={ttl_seconds}s")


async def is_blacklisted(jti: str, kind: str = "access") -> bool:
    r = await get_redis()
    key = f"blacklist:{kind}:{jti}"
    exists = await r.exists(key)
    return bool(exists)


# ---------------- Password-change session invalidation ----------------
# When a user changes their password we stamp pw_changed:<user_id> with the
# current epoch second. Every authenticated request then rejects any token
# whose `iat` (issued-at) is older than that stamp — so ALL sessions issued
# before the change (on any device, including a stolen one) stop working.

async def mark_password_changed(user_id: str, ttl_seconds: int) -> None:
    r = await get_redis()
    await r.set(f"pw_changed:{user_id}", str(int(time.time())), ex=max(ttl_seconds, 1))
    print(f"[REDIS] Marked password changed for user={user_id} ttl={ttl_seconds}s")


async def password_changed_after(user_id: str, issued_at: int) -> bool:
    """True if the user changed their password AFTER the given token iat, meaning
    the token must be rejected. Fail-open (returns False) if Redis is unreachable
    or the value is malformed — availability over this single defence-in-depth."""
    try:
        r = await get_redis()
        val = await r.get(f"pw_changed:{user_id}")
        if not val:
            return False
        return int(val) > int(issued_at)
    except Exception:
        return False


# ---------------- Rate Limiting (sliding window) ----------------

async def rate_limit_check(key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    """Returns (allowed, remaining_seconds_until_reset)."""
    r = await get_redis()
    now = int(time.time())
    window_start = now - window_seconds
    rl_key = f"rate_limit:{key}"

    pipe = r.pipeline()
    pipe.zremrangebyscore(rl_key, 0, window_start)
    pipe.zcard(rl_key)
    pipe.zadd(rl_key, {f"{now}:{int(time.time_ns())}": now})
    pipe.expire(rl_key, window_seconds)
    results = await pipe.execute()
    count = results[1]

    if count >= limit:
        # Get oldest entry to compute reset time
        oldest = await r.zrange(rl_key, 0, 0, withscores=True)
        if oldest:
            oldest_ts = int(oldest[0][1])
            reset_in = max(window_seconds - (now - oldest_ts), 1)
        else:
            reset_in = window_seconds
        print(f"[REDIS] Rate limit hit for key={key} count={count} limit={limit}")
        return False, reset_in
    return True, 0


# ---------------- OTP rate limiting (per-email AND per-IP) ----------------

async def otp_rate_limit(email: str) -> tuple[bool, int]:
    """Per-email OTP request cap: 5 per 15 min (allows a couple of resends,
    blocks email-bombing a single address)."""
    return await rate_limit_check(f"otp:email:{email.lower()}", limit=5, window_seconds=900)


async def otp_ip_rate_limit(ip: str) -> tuple[bool, int]:
    """Per-IP OTP request cap: 15 per 15 min — stops one host from enumerating
    OTPs across many email addresses while allowing shared-NAT classrooms."""
    return await rate_limit_check(f"otp:ip:{ip}", limit=15, window_seconds=900)


async def login_rate_limit(ip: str) -> tuple[bool, int]:
    """Per-IP login attempt cap: 20 per 15 min. Generous enough for a shared
    classroom/office NAT, tight enough to blunt online password guessing."""
    return await rate_limit_check(f"login:{ip}", limit=20, window_seconds=900)
