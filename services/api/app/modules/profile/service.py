from uuid import UUID

from sqlalchemy.orm import Session

from app.modules.profile.models import Profile
from app.modules.profile.repository import ProfileRepository
from app.modules.profile.schemas import ProfileUpdate

# services/profile.py是业务层
# 决定“读取资料”和“更新资料”的流程
# 提交数据库事务
# 更新后重新读取最新值返回给前端
class ProfileService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = ProfileRepository(db)

    def get_profile(self, user_id: UUID) -> Profile:
        profile = self.repository.get_or_create(user_id)
        self.db.commit()
        self.db.refresh(profile)
        return profile

    def update_profile(self, user_id: UUID, data: ProfileUpdate) -> Profile:
        profile = self.repository.get_or_create(user_id)

        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)

        self.db.commit()
        self.db.refresh(profile)
        return profile