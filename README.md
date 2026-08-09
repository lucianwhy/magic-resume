# ICAN 职业助手

ICAN 是一套可以交给 Codex、Claude Code 等 AI Agent 使用的职业工作流，同时提供 Magic Resume 网页版和命令行接口。

它覆盖四项连续任务。

- 初始化独立职业工作区
- 记录个人经历、能力证据和职业知识库
- 根据岗位 JD 生成新简历，同时保留原简历
- 针对技术面、项目面、压力面和 HR／业务面进行面试前培训

个人简历和职业资料保存在项目仓库之外的 ICAN 工作区。代码、Skill、用户数据互不混放。

## 两种使用方式

### Agent 加 CLI

Codex 或 Claude Code 加载 `skills/` 中的 Skill，再通过 `packages/cli/` 调用 Magic Resume 服务。整个简历读取、创建和更新过程可以在命令行完成，不需要模拟点击网页。

```text
Codex 或 Claude Code
        ↓
    ICAN Skill
        ↓
Magic Resume CLI
        ↓
  Web HTTP API
```

### 网页版

`apps/web/` 提供 Magic Resume 网页界面和 HTTP API。用户可以在浏览器中编辑、预览和导出简历。

本地启动后访问 [http://127.0.0.1:3000/app/dashboard/resumes](http://127.0.0.1:3000/app/dashboard/resumes)。

## 安装 ICAN Skills

需要 Node.js 20 及以上版本、Git 和 pnpm 10。

先克隆仓库并安装依赖。默认分支为 `master`。

```powershell
git clone https://github.com/lucianwhy/magic-resume.git
cd magic-resume
pnpm install --frozen-lockfile
```

### 安装到 Codex

```powershell
pnpm install:skills
```

Skill 默认安装到 `%USERPROFILE%\.codex\skills`。安装后重启 Codex 或开始一个新任务，让 Agent 重新发现 Skill。

### 安装到 Claude Code 或 cc-switch

```powershell
pnpm install:skills -- --target cc-switch
```

Skill 会安装到 `%USERPROFILE%\.cc-switch\skills`。

### 安装到自定义目录

```powershell
pnpm install:skills -- --target "D:\my-agent\skills"
```

如果目标目录中已有同名 Skill，安装程序会停止，避免静默覆盖。确认要更新时运行下面命令。

```powershell
pnpm install:skills -- --target codex --force
```

安装内容包括四个 Skill。

| Skill | 用途 |
| --- | --- |
| `ican-init` | 初始化或修复 ICAN 职业工作区 |
| `ican-career-knowledge-base` | 记录和查询个人经历、技能、证据与待补信息 |
| `ican-job-resume` | 根据 JD 创建有事实依据的新简历，保留原版本 |
| `ican-interview-prep-coach` | 针对四轮面试开展面试前培训 |

## 可以直接复制的提示词

不需要记命令。安装完成后，把下面任意一段发给 Codex 或 Claude Code。

### 第一次使用

```text
使用 ican-init 在当前目录初始化我的职业工作区。目录位置和 Git 隐私保护使用默认设置。完成后告诉我应该导入已有简历，还是从零开始建立资料。
```

### 导入已有简历和资料

```text
使用 ican-init 和 ican-career-knowledge-base 初始化这个职业项目。我已经有简历，请引导我导入，并把简历中的内容区分为已确认事实、个人陈述和待确认信息。不要把不确定内容直接当成事实。
```

### 没有简历，从零开始

```text
使用 ican-init 创建职业工作区。我目前没有简历，请使用 ican-career-knowledge-base 一步步询问我的教育经历、项目、技能、成果和目标岗位，先建立可以核验的职业档案。
```

### 根据岗位制作新简历

```text
使用 ican-job-resume，根据我提供的岗位 JD、原简历和职业知识库制作一份岗位定制简历。原简历必须保持不变，新建一个版本。只写有证据的内容，缺少证据的内容标记为待确认。需要写入 Magic Resume 时，全程使用 CLI。
```

### 开始面试前培训

```text
使用 ican-interview-prep-coach，读取我的目标岗位 JD、定制简历和职业知识库。先判断我最该准备技术面、项目面、压力面还是 HR／业务面，再为当前阶段讲解知识、项目表达方式、常见追问和补强建议。默认不进行现场模拟面试。
```

### 针对技术知识补课

```text
使用 ican-interview-prep-coach，结合目标岗位和我当前掌握程度，给我讲清楚 RAG、Agent、Function Call、向量数据库和多智能体协作。每个主题说明原理、常见架构、项目中的使用位置、面试表达和容易被追问的点。需要时推荐适合的短视频和长视频。
```

## 启动网页版

在仓库根目录运行。

```powershell
pnpm dev
```

生产构建和启动命令如下。

```powershell
pnpm build
pnpm start
```

## 使用 CLI

先启动网页版服务。CLI 默认连接 `http://localhost:3000`。

```powershell
pnpm resume -- list
pnpm resume -- get <简历ID>
pnpm resume -- put <简历JSON文件>
pnpm resume -- patch <简历ID> <修改JSON文件>
pnpm resume -- delete <简历ID>
```

连接其他部署地址时设置环境变量。

```powershell
$env:MAGIC_RESUME_URL = "http://127.0.0.1:3000"
$env:MAGIC_RESUME_API_KEY = "与服务端 RESUME_API_KEY 相同的值"
pnpm resume -- list
```

CLI 与网页版使用同一套 HTTP API。CLI 成功写入服务端，不代表所有浏览器 Profile 都会立即出现该简历。需要写入指定浏览器本地数据时，`ican-job-resume` 会按照指定浏览器和 Profile 执行导入流程，不会控制浏览器点击。

## 项目目录

```text
magic-resume/
├─ apps/web/          网页版和 HTTP API
├─ packages/cli/      Magic Resume CLI
├─ skills/            ICAN Skills
├─ docs/              架构、接口和开发文档
└─ scripts/           Skill 安装等仓库工具
```

详细设计见 [架构说明](docs/ARCHITECTURE.md) 和 [开发说明](docs/DEVELOPMENT.md)。

## 开发检查

```powershell
pnpm check
```

该命令检查网页版生产构建和 CLI 语法。

## 许可证

代码遵循仓库中的 [LICENSE](LICENSE)。
