from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.modules.profile.schemas import (
    EducationCreate,
    EducationResponse,
    EducationUpdate,
    ProfileResponse,
    ProfileUpdate,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from app.modules.profile.service import (
    EducationService,
    ProfileService,
    ProjectService,
)

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

from app.modules.profile.schemas import (
    EducationCreate,
    EducationResponse,
    EducationUpdate,
    ProfileResponse,
    ProfileUpdate,
)
from app.modules.profile.service import EducationService, ProfileService

education_router = APIRouter(
    prefix="/educations",
    tags=["educations"],
)


@education_router.get("", response_model=list[EducationResponse])
def list_educations(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return EducationService(db).list_educations(user_id)


@education_router.post(
    "",
    response_model=EducationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_education(
    data: EducationCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return EducationService(db).create_education(user_id, data)


@education_router.patch(
    "/{education_id}",
    response_model=EducationResponse,
)
def update_education(
    education_id: UUID,
    data: EducationUpdate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return EducationService(db).update_education(
        user_id,
        education_id,
        data,
    )


@education_router.delete(
    "/{education_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_education(
    education_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    EducationService(db).delete_education(user_id, education_id)

project_router = APIRouter(
    prefix="/projects",
    tags=["projects"],
)


@project_router.get("", response_model=list[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return ProjectService(db).list_projects(user_id)


@project_router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return ProjectService(db).get_project(user_id, project_id)


@project_router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    data: ProjectCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return ProjectService(db).create_project(user_id, data)


@project_router.patch(
    "/{project_id}",
    response_model=ProjectResponse,
)
def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return ProjectService(db).update_project(
        user_id,
        project_id,
        data,
    )


@project_router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    ProjectService(db).delete_project(user_id, project_id)
