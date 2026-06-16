from __future__ import annotations

import logging
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError
from sqlalchemy.exc import TimeoutError as SAPoolTimeout
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import assert_safe_production_config, settings
from app.core.exceptions import APIError
from app.core.redis import close_redis, get_redis
from app.db.seed import seed_master_admin
from app.db.session import AsyncSessionLocal, engine
from app.services.storage_service import ensure_dirs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    stream=sys.stdout,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=" * 60)
    print("[BOOT] Silicon Mango Academy — Backend starting up")
    print(f"[BOOT] Environment: {settings.ENVIRONMENT}")
    print(f"[BOOT] Frontend URL: {settings.FRONTEND_URL}")
    print("=" * 60)

    # Safety net: in production, refuse to start if any known-weak default secret
    # is still active. Aborts the process with a clear message before anything else.
    assert_safe_production_config()

    ensure_dirs()
    try:
        await get_redis()
    except Exception as e:
        print(f"[BOOT][WARN] Redis not reachable yet: {e}")

    async with AsyncSessionLocal() as db:
        try:
            await seed_master_admin(db)
        except Exception as e:
            print(f"[BOOT][ERROR] Seeding failed: {e}")

    print("[BOOT] Startup complete — accepting requests")
    yield

    print("[SHUTDOWN] Closing connections")
    await close_redis()


def create_app() -> FastAPI:
    # Interactive API docs are a useful dev tool but an information-disclosure
    # surface in production — disable them when ENVIRONMENT=production.
    docs_enabled = not settings.is_production
    app = FastAPI(
        title="Silicon Mango Academy API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )

    # CORS: in production allow ONLY the real frontend origin. In development
    # allow the usual localhost dev-server ports too.
    if settings.is_production:
        origins = [settings.FRONTEND_URL]
        origin_regex = None
    else:
        origins = [
            settings.FRONTEND_URL,
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
        origin_regex = r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"

    cors_kwargs = dict(
        allow_origins=list(dict.fromkeys([o for o in origins if o])),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        # NOTE: `expose_headers=["*"]` is INVALID together with credentials per the
        # CORS spec (browsers reject it). We expose nothing extra by default.
    )
    if origin_regex:
        cors_kwargs["allow_origin_regex"] = origin_regex
    app.add_middleware(CORSMiddleware, **cors_kwargs)

    @app.middleware("http")
    async def request_id_mw(request: Request, call_next):
        """Attach a short correlation id to every request so a user-facing error
        and the matching server log line can be tied together for support."""
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    # In production nginx serves /uploads directly from disk; this mount is a
    # harmless fallback for local (uvicorn-only) development.
    app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

    app.include_router(api_router, prefix="/api/v1")

    @app.get("/")
    async def root():
        return {"name": "Silicon Mango Academy API", "version": "1.0.0"}

    @app.get("/health")
    async def health():
        """Liveness only — used by the container healthcheck. Stays cheap so a
        transient DB/Redis blip doesn't cause a restart loop."""
        return {"status": "ok"}

    @app.get("/health/detail")
    async def health_detail():
        """Readiness/diagnostics — checks DB + Redis and reports DB pool usage.
        Returns 503 if a dependency is down. Safe to poll from a dashboard."""
        out: dict = {"status": "ok", "environment": settings.ENVIRONMENT, "db": "ok", "redis": "ok"}
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(text("SELECT 1"))
        except Exception as e:  # pragma: no cover
            out["db"] = f"error: {type(e).__name__}"
            out["status"] = "degraded"
        try:
            r = await get_redis()
            await r.ping()
        except Exception as e:  # pragma: no cover
            out["redis"] = f"error: {type(e).__name__}"
            out["status"] = "degraded"
        try:
            pool = engine.pool
            out["db_pool"] = {
                "checked_out": pool.checkedout(),
                "size": pool.size(),
                "overflow": pool.overflow(),
            }
        except Exception:
            pass
        return JSONResponse(status_code=200 if out["status"] == "ok" else 503, content=out)

    def _cors_headers(request: Request) -> dict:
        """Build CORS headers manually for exception responses.
        Starlette's CORSMiddleware doesn't always wrap responses from
        the global Exception handler, so we add them here as a safety net.
        """
        origin = request.headers.get("origin")
        if not origin:
            return {}
        import re
        # Production: only the configured frontend origin. Dev: also any localhost port.
        allowed = origin == settings.FRONTEND_URL or (
            not settings.is_production
            and re.match(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$", origin)
        )
        if allowed:
            return {
                "access-control-allow-origin": origin,
                "access-control-allow-credentials": "true",
                "vary": "Origin",
            }
        return {}

    @app.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError):
        detail = exc.detail if isinstance(exc.detail, dict) else {"code": "ERROR", "message": str(exc.detail)}
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "error": detail},
            headers=_cors_headers(request),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, exc: StarletteHTTPException):
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            return JSONResponse(
                status_code=exc.status_code,
                content={"success": False, "error": exc.detail},
                headers=_cors_headers(request),
            )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": {"code": "HTTP_ERROR", "message": str(exc.detail)},
            },
            headers=_cors_headers(request),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        print(f"[VALIDATION] {request.method} {request.url.path}: {exc.errors()}")
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Validation failed",
                    "details": _safe_errors(exc.errors()),
                },
            },
            headers=_cors_headers(request),
        )

    @app.exception_handler(Exception)
    async def generic_handler(request: Request, exc: Exception):
        rid = getattr(request.state, "request_id", None)
        print(f"[ERROR] rid={rid} {request.method} {request.url.path}: {type(exc).__name__}: {exc}")
        import traceback

        traceback.print_exc()

        def fail(status: int, code: str, message: str) -> JSONResponse:
            err = {"code": code, "message": message}
            if rid:
                err["request_id"] = rid
            return JSONResponse(
                status_code=status,
                content={"success": False, "error": err},
                headers=_cors_headers(request),
            )

        # DB connection pool exhausted → the box is momentarily saturated. Tell the
        # user to retry rather than showing a scary 500.
        if isinstance(exc, SAPoolTimeout):
            return fail(
                503,
                "SERVER_BUSY",
                "The server is handling a lot of requests right now. Please wait a moment and try again.",
            )
        # Database unreachable / dropped connection.
        if isinstance(exc, (OperationalError, InterfaceError, DBAPIError)):
            return fail(
                503,
                "SERVICE_UNAVAILABLE",
                "We're having trouble reaching the database right now. Please try again shortly.",
            )
        # Redis connection issues.
        msg = str(exc).lower()
        if "redis" in type(exc).__module__.lower() or "connection refused" in msg:
            return fail(
                503,
                "SERVICE_UNAVAILABLE",
                "A backend service (Redis) is temporarily unavailable. Please try again shortly.",
            )
        return fail(500, "INTERNAL_ERROR", "Something went wrong on our end. Please try again.")

    return app


def _safe_errors(errors: list) -> list:
    """Strip non-JSON-serializable bits (e.g., bytes) from validation errors."""
    safe = []
    for e in errors:
        e2 = dict(e)
        if "input" in e2 and isinstance(e2["input"], (bytes, bytearray)):
            e2["input"] = "<binary>"
        if "ctx" in e2 and isinstance(e2["ctx"], dict):
            e2["ctx"] = {k: str(v) for k, v in e2["ctx"].items()}
        safe.append(e2)
    return safe


app = create_app()
