from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database import SessionLocal
from app.main import app
from app.models import User

from app.modules.profile.models import Profile
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
            db.execute(delete(Profile).where(Profile.user_id == TEST_USER_ID))
            db.execute(delete(User).where(User.id == TEST_USER_ID))
            db.commit()