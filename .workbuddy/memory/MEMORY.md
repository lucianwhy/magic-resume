# 项目长期记忆

## 项目约定

- **个人中心进度文档**：`docs/个人中心进度文档.md` 是个人中心功能的进度追踪文档。**每次更新个人中心相关功能后，必须同步更新该文档**（进度概览、已完成内容、差距表、更新日志和头部"上次更新"日期）。
- 个人中心功能依据 `docs/个人中心信息库实施方案.md`（V1.0）分四周迭代开发；当前处于第 1 周数据骨架阶段（2026-08-21）。
- 后端位于 `services/api/`（FastAPI + PostgreSQL + SQLAlchemy + Alembic），前端位于 `apps/web/src/features/profile/` 与 `apps/web/src/app/dashboard/profile/`。
- 架构权威文档：`AGENTS.md` 与 `docs/ARCHITECTURE.md`，开发前先阅读。
