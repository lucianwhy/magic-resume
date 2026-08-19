from uuid import UUID

from sqlalchemy.orm import Session

from app.models import User
from app.modules.profile.models import Profile

# repositories/profile.py 是数据访问层：
# 按user_id 查profile
# 当前用户首次访问时创建空的User 和Profile
# 不处理HTTP、页面或前端提示
class ProfileRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_or_create(self, user_id: UUID) -> Profile:
        profile = self.db.get(Profile, user_id)

        if profile is not None:
            return profile

        if self.db.get(User, user_id) is None:
            self.db.add(User(id=user_id))
            self.db.flush()

        profile = Profile(user_id=user_id)
        self.db.add(profile)
        self.db.flush()

        return profile
