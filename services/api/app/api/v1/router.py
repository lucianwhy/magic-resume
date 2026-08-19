from fastapi import APIRouter

from app.modules.profile.router import router as profile_router
# router.py 统一把v1接口挂到 /api/v1 前缀下
router = APIRouter(prefix="/api/v1")
router.include_router(profile_router)