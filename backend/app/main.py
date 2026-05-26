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
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(dict.fromkeys(origins)),
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

    @app.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError):
        detail = exc.detail if isinstance(exc.detail, dict) else {"code": "ERROR", "message": str(exc.detail)}
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "error": detail},
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, exc: StarletteHTTPException):
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            return JSONResponse(
                status_code=exc.status_code,
                content={"success": False, "error": exc.detail},
            )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": {"code": "HTTP_ERROR", "message": str(exc.detail)},
            },
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
                    "details": exc.errors(),
                },
            },
        )

    @app.exception_handler(Exception)
    async def generic_handler(request: Request, exc: Exception):
        print(f"[ERROR] Unhandled error on {request.method} {request.url.path}: {exc}")
        import traceback

        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
        )

    return app


app = create_app()
