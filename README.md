# ✨ Magic Resume

现代化在线简历编辑器。支持实时预览、主题定制、自动保存、PDF 导出及响应式展示。本仓库还提供团队使用的职业知识库与岗位定制简历 Skill。

## 项目截图

<img width="1920" height="1440" alt="Magic Resume 编辑器截图" src="https://github.com/user-attachments/assets/4667e49a-7bf2-4379-9390-725e42799dc7" />

## 功能

- 实时编辑与预览
- 多模板与自定义主题
- 深色模式与响应式布局
- 自动保存与本地存储
- PDF 导出
- AI 辅助写作
- 一页简历排版

## 技术栈

- TanStack Start
- TypeScript
- Motion
- Tiptap
- Tailwind CSS
- Zustand
- Shadcn/ui
- Lucide Icons

## 快速开始

```bash
git clone https://github.com/lucianwhy/magic-resume.git
cd magic-resume
pnpm install
pnpm dev
```

启动后访问 `http://localhost:3000`。

## 构建与部署

构建项目：

```bash
pnpm build
```

使用 Docker Compose：

```bash
docker compose up -d
```

## 安装团队 Skill

仓库内的 [`skills`](./skills) 目录包含两个可共享的 Codex Skill：

- [`ican-career-knowledge-base`](./skills/ican-career-knowledge-base)：沉淀个人经历、成果、偏好和职业目标，作为可追溯的职业事实库。
- [`ican-job-resume`](./skills/ican-job-resume)：基于职位 JD 和已验证事实生成新的定制简历版本，不覆盖原简历。

队员克隆仓库后，在 PowerShell 执行以下命令即可安装到本机 Codex：

```powershell
Copy-Item .\skills\ican-career-knowledge-base "$env:USERPROFILE\.codex\skills\" -Recurse -Force
Copy-Item .\skills\ican-job-resume "$env:USERPROFILE\.codex\skills\" -Recurse -Force
```

完成后重启 Codex 或新开任务，使其重新加载 Skill。需要更新时，在仓库中拉取最新代码后重复以上命令。

也可直接把下面提示词发给 Codex：

```text
请从 https://github.com/lucianwhy/magic-resume/tree/master/skills 安装
ican-career-knowledge-base 和 ican-job-resume 两个 Skill 到我的 Codex Skills 目录，
保留原有 Skill，并告诉我安装结果。
```

## 使用说明

职业知识库 Skill 用于记录和检索可信的职业事实；岗位定制简历 Skill 只会使用可追溯的事实，并为每次改写创建新版本。不要用它补造职责、技术、指标或成果。

## 开源许可

许可与使用条款见 [LICENSE](./LICENSE)。

## 支持项目

如果项目对你有帮助，欢迎 Star。
