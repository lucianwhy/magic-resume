# ICAN 仓库架构

## 目标

同一仓库交付两种使用方式：

1. Agent 方式：Codex 或 Claude Code 加载 `skills/`，通过 `packages/cli/` 操作简历服务。
2. Web 方式：用户在 `apps/web/` 提供的界面中编辑、预览和导出简历。

用户职业资料保存在仓库外的 ICAN 工作区，不与代码或 Skill 源码混放。

## 目录

```text
ican-career-suite/
├─ apps/
│  └─ web/                 # 网页版及 HTTP 接口实现
├─ packages/
│  └─ cli/                 # 面向人和 Agent 的 HTTP CLI
├─ services/
│  └─ api/                 # FastAPI 个人信息服务与数据库迁移
├─ skills/                 # 可独立安装的 ican-* Skills
├─ docs/                   # 架构、接口和开发文档
├─ scripts/                # 仓库级工具
├─ package.json            # 工作区统一命令
└─ pnpm-workspace.yaml
```

## 模块与接口

### Web 模块

接口：HTTP 页面与 `/api/resumes`。实现位于 `apps/web/`。Web 不读取 Skill 目录，也不假设 Agent 类型。

当前 Web 正处于 Next 风格页面向 TanStack Start 路由迁移后的兼容期：`src/routes/` 提供路由入口，部分页面实现仍复用 `src/app/`。两者都属于 Web 模块；清理 `src/app/` 前必须先解除 `src/routes/` 中的对应导入。生产质量门槛以 Vite 构建为准。

### CLI 模块

接口：`magic-resume <command>` 或 `pnpm resume -- <command>`。实现位于 `packages/cli/`。CLI 仅调用 Web HTTP 接口，因此可以连接本地或远程部署。

环境变量：`MAGIC_RESUME_URL`、`MAGIC_RESUME_API_KEY`。

### Skills 模块

接口：每个 `skills/ican-*/SKILL.md`。Skill 可以调用 CLI，但不能导入 `apps/web/src` 或依赖仓库绝对路径。

当前套件：

- `ican-init`
- `ican-career-knowledge-base`
- `ican-job-resume`
- `ican-interview-prep-coach`

### 用户职业工作区

接口：`.ican/project.json`。由 `ican-init` 创建，默认包含 `knowledge/`、`jobs/`、`resumes/` 和 `interviews/`。它是运行数据，不属于本仓库。

## 依赖方向

```text
Agent → Skill → CLI → Web HTTP API → resume storage
User  → Web UI ───────────────────→ resume storage
Web 个人中心 UI → Profile API HTTP → PostgreSQL
```

允许方向只有从左向右。禁止 CLI 导入 Web 内部代码，禁止 Web 读取 Skill，禁止提交用户工作区。

## 演进原则

- Web 内部可以重构，只要 HTTP 接口保持兼容。
- CLI 可以增加命令，只要现有命令、JSON 输出和退出码保持兼容。
- Skill 可以迭代工作流，只要 `.ican/project.json` 和事实边界保持兼容。
- 工作区协议需要破坏性升级时，增加 schema version 和迁移工具，不静默改写旧数据。

### API 服务模块

接口：`/health`、`/api/v1/profile`。实现位于 `services/api/`，使用 FastAPI、PostgreSQL、SQLAlchemy 和 Alembic。

Web 通过 HTTP 调用该服务，不导入 Python 源码；该服务也不得导入 Web、CLI 或 Skill 内部实现。开发期通过服务端固定的演示用户隔离资料；接入认证后由认证上下文提供 `user_id`，客户端请求体不得携带它。