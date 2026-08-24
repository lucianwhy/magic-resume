from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.profile.models import Education, Profile, Project
from app.modules.profile.repository import (
    EducationRepository,
    ProfileRepository,
    ProjectRepository,
)
from app.modules.profile.schemas import (
    EducationCreate, 
    EducationUpdate, 
    ProjectCreate,
    ProjectUpdate,
    ProfileUpdate,
)


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

class EducationService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = EducationRepository(db)

    def list_educations(self, user_id: UUID) -> list[Education]:
        return self.repository.list_by_user(user_id)

    def create_education(
        self,
        user_id: UUID,
        data: EducationCreate,
    ) -> Education:
        ProfileRepository(self.db).get_or_create(user_id)

        education = self.repository.create(
            user_id,
            **data.model_dump(),
        )
        self.db.commit()
        self.db.refresh(education)
        return education

    def update_education(
        self,
        user_id: UUID,
        education_id: UUID,
        data: EducationUpdate,
    ) -> Education:
        education = self.repository.get_by_id(user_id, education_id)

        if education is None:
            raise HTTPException(status_code=404, detail="Education not found")

        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(education, field, value)

        self.db.commit()
        self.db.refresh(education)
        return education

    def delete_education(
        self,
        user_id: UUID,
        education_id: UUID,
    ) -> None:
        education = self.repository.get_by_id(user_id, education_id)

        if education is None:
            raise HTTPException(status_code=404, detail="Education not found")

        self.repository.delete(education)
        self.db.commit()


class ProjectService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = ProjectRepository(db)

    def list_projects(self, user_id: UUID) -> list[Project]:
        return self.repository.list_by_user(user_id)

    def create_project(
        self,
        user_id: UUID,
        data: ProjectCreate,
    ) -> Project:
        ProfileRepository(self.db).get_or_create(user_id)

        project = self.repository.create(
            user_id,
            **data.model_dump(),
        )
        self.db.commit()
        self.db.refresh(project)
        return project

    def update_project(
        self,
        user_id: UUID,
        project_id: UUID,
        data: ProjectUpdate,
    ) -> Project:
        project = self.repository.get_by_id(user_id, project_id)

        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(project, field, value)

        self.db.commit()
        self.db.refresh(project)
        return project

    def delete_project(
        self,
        user_id: UUID,
        project_id: UUID,
    ) -> None:
        project = self.repository.get_by_id(user_id, project_id)

        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        self.repository.delete(project)
        self.db.commit()