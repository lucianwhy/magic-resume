from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# HTTP请求和响应的格式约束。ProfileUpdate 是前端允许提交的字段，ProfileResponse 是服务端返回的完整资料

StudyStatus = Literal["studying", "graduated", "other"]
JobStatus = Literal[
    "looking_for_internship",
    "looking_for_full_time",
    "employed",
    "other",
]


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    school: str | None = Field(default=None, max_length=200)
    major: str | None = Field(default=None, max_length=200)
    graduation_date: str | None = Field(default=None, max_length=30)
    study_status: StudyStatus | None = None
    job_status: JobStatus | None = None
    target_role: str | None = Field(default=None, max_length=200)


class ProfileResponse(ProfileUpdate):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    updated_at: datetime

""" 新建时允许提交什么 """
class EducationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    school: str = Field(min_length=1, max_length=200)
    degree: str | None = Field(default=None, max_length=100)
    major: str | None = Field(default=None, max_length=200)
    start_date: str | None = Field(default=None, max_length=30)
    end_date: str | None = Field(default=None, max_length=30)
    study_status: StudyStatus | None = None

""" 修改时允许提交什么 """
class EducationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    school: str | None = Field(default=None, min_length=1, max_length=200)
    degree: str | None = Field(default=None, max_length=100)
    major: str | None = Field(default=None, max_length=200)
    start_date: str | None = Field(default=None, max_length=30)
    end_date: str | None = Field(default=None, max_length=30)
    study_status: StudyStatus | None = None

""" 服务端返回什么 """
class EducationResponse(EducationCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=2000)
    tech_stack: list[str] = Field(default_factory=list, max_length=30)
    responsibilities: str | None = Field(default=None, max_length=3000)
    completion_score: int = Field(default=0, ge=0, le=100)


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=2000)
    tech_stack: list[str] | None = Field(default=None, max_length=30)
    responsibilities: str | None = Field(default=None, max_length=3000)
    completion_score: int | None = Field(default=None, ge=0, le=100)


class ProjectResponse(ProjectCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime