from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth as auth_router
from app.api.v1.admin import (
    batches as admin_batches,
    certificates as admin_certificates,
    courses as admin_courses,
    dashboard as admin_dashboard,
    enrollments as admin_enrollments,
    organizations as admin_organizations,
    payments as admin_payments,
    users as admin_users,
    webinars as admin_webinars,
)
from app.api.v1.instructor import router as instructor_router, videos as instructor_videos
from app.api.v1.student import (
    router as student_router,
    videos as student_videos,
    profile as student_profile,
    payments as student_payments,
)
from app.api.v1 import public as public_router
from app.api.v1 import public_webinars as public_webinars_router

api_router = APIRouter()
api_router.include_router(auth_router.router)
api_router.include_router(public_router.router)
api_router.include_router(public_webinars_router.router)

admin_router = APIRouter(prefix="/admin")
admin_router.include_router(admin_dashboard.router)
admin_router.include_router(admin_courses.router)
admin_router.include_router(admin_batches.router)
admin_router.include_router(admin_users.router)
admin_router.include_router(admin_enrollments.router)
admin_router.include_router(admin_certificates.router)
admin_router.include_router(admin_payments.router)
admin_router.include_router(admin_organizations.router)
admin_router.include_router(admin_webinars.router)
api_router.include_router(admin_router)

api_router.include_router(instructor_router.router)
api_router.include_router(instructor_videos.router)
api_router.include_router(student_router.router)
api_router.include_router(student_videos.router)
api_router.include_router(student_profile.router)
api_router.include_router(student_payments.router)
