from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.database import SessionLocal
from app.main import app
from app.models import User

from app.modules.profile.models import Education, Profile, Project
from app.modules.profile.router import get_current_user_id

TEST_USER_ID = UUID("00000000-0000-0000-0000-000000000099")


def test_profile_can_be_created_updated_and_read():
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID

    try:
        client = TestClient(app)

        initial = client.get("/api/v1/profile")
        assert initial.status_code == 200
        assert initial.json()["user_id"] == str(TEST_USER_ID)

        updated = client.patch(
            "/api/v1/profile",
            json={
                "name": "数据库测试用户",
                "city": "杭州",
                "target_role": "后端开发工程师",
            },
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "数据库测试用户"

        read_back = client.get("/api/v1/profile")
        assert read_back.status_code == 200
        assert read_back.json()["city"] == "杭州"
    finally:
        app.dependency_overrides.clear()

        with SessionLocal() as db:
            db.query(Project).filter(
                Project.user_id == TEST_USER_ID
            ).delete()

            db.query(Education).filter(
                Education.user_id == TEST_USER_ID
            ).delete()

            db.query(Profile).filter(
                Profile.user_id == TEST_USER_ID
            ).delete()

            db.query(User).filter(
                User.id == TEST_USER_ID
            ).delete()

            db.commit()


def test_education_crud():
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID

    education_id = None

    try:
        client = TestClient(app)

        created = client.post(
            "/api/v1/educations",
            json={
                "school": "浙江大学",
                "degree": "本科",
                "major": "计算机科学与技术",
                "start_date": "2022-09",
                "end_date": "2026-06",
                "study_status": "graduated",
            },
        )

        assert created.status_code == 201
        body = created.json()
        assert body["school"] == "浙江大学"
        assert body["major"] == "计算机科学与技术"

        education_id = body["id"]

        listed = client.get("/api/v1/educations")

        assert listed.status_code == 200
        assert len(listed.json()) == 1
        assert listed.json()[0]["id"] == education_id

        updated = client.patch(
            f"/api/v1/educations/{education_id}",
            json={
                "major": "人工智能",
            },
        )

        assert updated.status_code == 200
        assert updated.json()["major"] == "人工智能"
        assert updated.json()["school"] == "浙江大学"

        deleted = client.delete(
            f"/api/v1/educations/{education_id}",
        )

        assert deleted.status_code == 204

        listed_after_delete = client.get("/api/v1/educations")

        assert listed_after_delete.status_code == 200
        assert listed_after_delete.json() == []

    finally:
        app.dependency_overrides.clear()

        with SessionLocal() as db:
            db.query(Education).filter(
                Education.user_id == TEST_USER_ID
            ).delete()

            db.query(Project).filter(
                Project.user_id == TEST_USER_ID
            ).delete()

            db.query(Profile).filter(
                Profile.user_id == TEST_USER_ID
            ).delete()

            db.query(User).filter(
                User.id == TEST_USER_ID
            ).delete()

            db.commit()

def test_project_crud():
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID

    project_id = None

    try:
        client = TestClient(app)

        created = client.post(
            "/api/v1/projects",
            json={
                "name": "AI 求职助手",
                "summary": "面向求职者的个人事实库和简历生成系统",
                "tech_stack": [
                    "Python",
                    "FastAPI",
                    "PostgreSQL",
                ],
                "responsibilities": "负责个人信息库和后端 API 开发",
                "completion_score": 60,
            },
        )

        assert created.status_code == 201
        body = created.json()
        assert body["name"] == "AI 求职助手"
        assert body["tech_stack"] == [
            "Python",
            "FastAPI",
            "PostgreSQL",
        ]
        assert body["completion_score"] == 60

        project_id = body["id"]

        listed = client.get("/api/v1/projects")

        assert listed.status_code == 200
        assert len(listed.json()) == 1
        assert listed.json()[0]["id"] == project_id

        updated = client.patch(
            f"/api/v1/projects/{project_id}",
            json={
                "completion_score": 80,
                "responsibilities": "负责 FastAPI API、数据库和测试",
            },
        )

        assert updated.status_code == 200
        assert updated.json()["completion_score"] == 80
        assert updated.json()["name"] == "AI 求职助手"

        deleted = client.delete(
            f"/api/v1/projects/{project_id}",
        )

        assert deleted.status_code == 204

        listed_after_delete = client.get("/api/v1/projects")

        assert listed_after_delete.status_code == 200
        assert listed_after_delete.json() == []

    finally:
        app.dependency_overrides.clear()

        with SessionLocal() as db:
            db.query(Project).filter(
                Project.user_id == TEST_USER_ID
            ).delete()

            db.query(Education).filter(
                Education.user_id == TEST_USER_ID
            ).delete()

            db.query(Profile).filter(
                Profile.user_id == TEST_USER_ID
            ).delete()

            db.query(User).filter(
                User.id == TEST_USER_ID
            ).delete()

            db.commit()

def test_project_rejects_invalid_completion_score():
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID

    try:
        client = TestClient(app)

        response = client.post(
            "/api/v1/projects",
            json={
                "name": "非法项目",
                "completion_score": 120,
            },
        )

        assert response.status_code == 422

    finally:
        app.dependency_overrides.clear()

def test_project_cannot_be_read_by_another_user():
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID

    try:
        client = TestClient(app)

        response = client.get(
            "/api/v1/projects/00000000-0000-0000-0000-000000000001"
        )

        assert response.status_code == 200
        assert response.json() == []

    finally:
        app.dependency_overrides.clear()