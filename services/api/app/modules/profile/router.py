from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.modules.profile.schemas import ProfileResponse, ProfileUpdate
from app.modules.profile.service import ProfileService

router = APIRouter(prefix="/profile", tags=["profile"])

# profile.py 定义两个当前接口：
# GET /api/v1/profile:读取固定信息
# PATCH /api/v1/profile:局部更新固定信息
def get_current_user_id() -> UUID:
    # 登录接入前，由服务端配置提供固定演示用户。
    # 前端永远不能自行提交 user_id，否则将产生越权风险
    return settings.demo_user_id


@router.get("", response_model=ProfileResponse)
def get_profile(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return ProfileService(db).get_profile(user_id)


@router.patch("", response_model=ProfileResponse)
def update_profile(
    data: ProfileUpdate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return ProfileService(db).update_profile(user_id, data)