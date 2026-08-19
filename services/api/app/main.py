from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as api_v1_router
from app.core.config import settings

app = FastAPI(title="Magic Resume Profile API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_v1_router)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "magic-resume-profile-api"}
# app/ 是FastAPI实际运行的python包
# main.py 应用总入口。创建FastAPI、配置CORS、并注册/health 与 /api/v1路由