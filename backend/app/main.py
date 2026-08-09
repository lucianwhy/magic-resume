from datetime import datetime, timezone
from typing import Literal

#FastAPI：创建web后端和定义接口
from fastapi import FastAPI
from fastapi.responses import JSONResponse

# CORS中间件：允许前端网页跨页访问后端
from fastapi.middleware.cors import CORSMiddleware
#Field：定义数据模型的字段属性
from pydantic import BaseModel, ConfigDict, Field


class UTF8JSONResponse(JSONResponse):
    media_type = "application/json; charset=utf-8"

# 创建FastAPI应用对象
# title 和 version 会显示在自动接口文档 /docs 中。
app = FastAPI(
    title="求职智能体 API",
    version="0.1.0",
    default_response_class=UTF8JSONResponse,
)

# 添加跨域配置
# 前端通常运行在 localhost:3000 或 localhost:5173，允许这些地址访问后端接口。
# 后端运行在 localhost:8000,端口不同会被浏览器视为跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
    ],
    # 以后若使用Cookie 登录，浏览器才允许携带凭证
    allow_credentials=True,
    # 允许GET、POST、PUT、DELETE等所有请求方法
    allow_methods=["*"],
    # 允许Content-Type、Authorization等所有请求头
    allow_headers=["*"],
)

# 统一生成 UTC 格式的时间字符串。
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

#  这是“更新个人资料时，前端允许提交的数据结构”
# 它既会校验数据、也会生成FastAPI 文档
class ProfileUpdate(BaseModel):
    # 禁止前端多传未定义字段。
    # 例如传 {“age”:20} 会报错，因为 age 字段未定义。
    # 可以防止字段拼写错误被悄悄忽略
    model_config = ConfigDict(extra="forbid")

    # `str | None` 表示字段可以是字符串，也可以是 None。
    # Field() 用于定义字段的默认值、最小长度、最大长度等约束。
    name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    school: str | None = Field(default=None, max_length=200)
    major: str | None = Field(default=None, max_length=200)
    graduation_date: str | None = Field(default=None, max_length=30)
    # Literal 限制再度状态只能是这三个英文值之一。
    # 前端实际展示时可映射为“在读”“已毕业”“其他”
    study_status: Literal["studying", "graduated", "other"] | None = None

    # 求职状态：在找实习、在找全职、已就业、其他（同样使用 Literal 限制为四个英文值之一）
    job_status: Literal[
        "looking_for_internship",
        "looking_for_full_time",
        "employed",
        "other",
    ] | None = None
    target_role: str | None = Field(default=None, max_length=200)


# 这是后端返回给前端的数据结构
# 它继承了 ProfileUpdate，因此自动拥有上面所有资料字段，
# 再额外增加user_id 和 updated_at 两个字段。
class ProfileResponse(ProfileUpdate):
    user_id: str
    updated_at: str

# 当前只是演示用的固定用户
# 真正接入登录后，这个值应来自 JWT 或 Session，而不是写死
DEMO_USER_ID = "demo-user-001"

# 当前的“数据库替代品”
# 数据仅存在Python进程内存中
# 服务重启后数据会丢失
profile = ProfileResponse(
    user_id=DEMO_USER_ID,
    updated_at=now_iso(),
)

# @app.get 表示：当浏览器或前端发起GET/health 时执行这个函数
# 健康检查通常用于确认后端是否正常运行
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "job-agent-api",
    }

# GET /api/v1/profile：读取当前用户的固定信息
# response_model = ProfileResponse 表示：
# 1.返回值必须符合 ProfileResponse:
# 2.自动展示在 /docs 文档中
# 3.防止后端意外返回不该暴露的字段
@app.get("/api/v1/profile", response_model=ProfileResponse)
def get_profile():
    return profile

# PATCH /api/v1/profile:局部更新固定信息
# `data：ProfileUpdate` 表示FastAPI 会自动读取JSON请求体，
# 并按ProfileUpdate 校验后传入data
@app.patch("/api/v1/profile", response_model=ProfileResponse)
def update_profile(data: ProfileUpdate):
    # 函数中要给全局profile 重新赋值
    # 所以必须声明global:否则Python 会认为profile是局部变量
    global profile

    # 只取“前端实际传入”的字段
    #
    #例如前端只传：
    #{"name":"张三"}
    #
    #那么changes 只有：
    #{"name":"张三"}
    #
    #这正是PATCH 的含义：只修改部分字段
    #不会把 phone email 等未提交字段更新为None
    changes = data.model_dump(exclude_unset=True)

    #model_copy 会复制出一个新的ProfileResponse对象
    #update 中的字段覆盖旧值，未出现的字段继续沿用旧值
    profile = profile.model_copy(
        update={
            **changes,      #展开本次需要修改的字段
            "updated_at": now_iso(),  # 每次修改都更新时间
        }
    )

    # 返回更新后的完整资料
    return profile