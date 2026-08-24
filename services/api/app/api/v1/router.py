from fastapi import APIRouter

from app.modules.profile.router import (
    education_router,
    project_router,
    router as profile_router,
)
# router.py 统一把v1接口挂到 /api/v1 前缀下
router = APIRouter(prefix="/api/v1")

router.include_router(profile_router)
router.include_router(education_router)
router.include_router(project_router)