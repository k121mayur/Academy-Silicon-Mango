from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import APIError
from app.core.redis import close_redis, get_redis
from app.db.seed import seed_master_admin
from app.db.session import AsyncSessionLocal
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
    app = FastAPI(
        title="Silicon Mango Academy API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    origins = [
        settings.FRONTEND_URL,
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(dict.fromkeys(origins)),
        allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

    app.include_router(api_router, prefix="/api/v1")

    @app.get("/")
    async def root():
        return {"name": "Silicon Mango Academy API", "version": "1.0.0", "docs": "/docs"}

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    def _cors_headers(request: Request) -> dict:
        """Build CORS headers manually for exception responses.
        Starlette's CORSMiddleware doesn't always wrap responses from
        the global Exception handler, so we add them here as a safety net.
        """
        origin = request.headers.get("origin")
        if not origin:
            return {}
        # Allow any localhost/127.0.0.1 port, plus the configured frontend
        import re
        if (
            re.match(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$", origin)
            or origin == settings.FRONTEND_URL
        ):
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
        print(f"[ERROR] Unhandled error on {request.method} {request.url.path}: {exc}")
        import traceback

        traceback.print_exc()
        # Detect Redis connection issues and report them clearly
        msg = str(exc).lower()
        if "redis" in type(exc).__module__.lower() or "connection refused" in msg:
            return JSONResponse(
                status_code=503,
                content={
                    "success": False,
                    "error": {
                        "code": "SERVICE_UNAVAILABLE",
                        "message": "Backend dependency (Redis) is not reachable. Start Redis and try again.",
                    },
                },
                headers=_cors_headers(request),
            )
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
            headers=_cors_headers(request),
        )

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
