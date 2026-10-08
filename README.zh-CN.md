<div align="center">

# ✨ Magic Resume ✨

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
![TanStack Start](https://img.shields.io/badge/TanStack_Start-latest-black)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-10.0-purple)

<a href="https://trendshift.io/repositories/13077" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13077" alt="Magic Resume | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>


简体中文 | [English](./README.md)

</div>

Magic Resume 是一个现代化的在线简历编辑器，让创建专业简历变得简单有趣。基于 TanStack Start 和 Motion 构建，支持实时预览和自定义主题。

## 📸 项目截图

<img width="1920" height="1440" alt="85_1x_shots_so" src="https://github.com/user-attachments/assets/4667e49a-7bf2-4379-9390-725e42799dc7" />


## ✨ 特性

- 🚀 基于 TanStack Start 构建
- 💫 流畅的动画效果 (Motion)
- 🎨 自定义主题支持
- 🌙 深色模式
- 📤 导出为 PDF
- 🔄 实时预览
- 💾 自动保存
- 🔒 本地 PostgreSQL 存储与旧浏览器数据迁移

## 🛠️ 技术栈

- TanStack Start
- TypeScript
- Motion
- Tiptap
- Tailwind CSS
- Zustand
- Shadcn/ui
- Lucide Icons

## 🚀 快速开始

1. 克隆项目

```bash
git clone https://github.com/lucianwhy/magic-resume.git
cd magic-resume
git checkout main2DB
```

2. 安装依赖

```bash
pnpm install
```

3. 启动数据库、建表和开发服务器（无需 Docker）

```bash
pnpm db:start
pnpm db:migrate
pnpm dev
```

4. 打开浏览器访问 `http://localhost:3000`

首次进入简历页面会导入此浏览器、此地址下的旧简历；数据库保留迁移备份，确认入库后清理旧浏览器存储。`localhost` 与 `127.0.0.1` 的浏览器存储不同，请使用原先的地址进行迁移。详见 [数据库存储与 API](docs/DATABASE_STORAGE.md) 和 [本地 PostgreSQL](docs/LOCAL_POSTGRES.md)。本分支为本机单人使用，公开部署前需要增加身份验证与数据权限。

## 🤖 安装 CLI 与 MCP

使用包含数据库迁移的 `main2DB` 分支代码，准备 Node.js 22.12+（本机已验证 Node.js 24）和 pnpm。先按上面的快速开始安装依赖、启动 PostgreSQL、执行迁移并保持 `pnpm dev` 运行；CLI、MCP 和网页共享 `http://127.0.0.1:3000` 的本机 API，无需 Docker。

### CLI

在仓库目录即可使用，无需全局安装：

```bash
pnpm resume --help
pnpm resume list
pnpm resume create --title "我的简历"
pnpm resume get RESUME_ID
pnpm resume patch RESUME_ID --revision 1 --file patch.json
pnpm resume export RESUME_ID --output resume.json
pnpm resume import --file resume.json
```

将 `RESUME_ID` 和版本号替换为 `get/list` 返回的真实值。`patch.json` 例如：

```json
{ "basic": { "title": "AI 应用开发工程师" } }
```

若需要从任意目录调用，可在仓库执行 `npm link`，之后使用 `magic-resume --help`；也可直接运行 `node /你的绝对路径/magic-resume/scripts/resume-cli.mjs list`。自动化使用 Node 入口可以得到纯 JSON 输出。更新、删除必须带版本号，冲突返回退出码 `2`。

### MCP 客户端

在仓库运行以下命令，为其他本机 MCP 客户端生成包含 Node 和仓库绝对路径的配置：

```bash
node scripts/resume-mcp-config.mjs
```

将生成的 `mcpServers` 条目合并进客户端配置，保留已有服务。通用配置结构：

```json
{
  "mcpServers": {
    "magic-resume": {
      "command": "/Node可执行文件的绝对路径/node",
      "args": ["/仓库绝对路径/magic-resume/scripts/resume-mcp.mjs"],
      "env": { "MAGIC_RESUME_API_URL": "http://127.0.0.1:3000" }
    }
  }
}
```

Codex 用户可直接登记 stdio 服务（替换两个绝对路径）：

```bash
codex mcp add magic-resume --env MAGIC_RESUME_API_URL=http://127.0.0.1:3000 -- /Node绝对路径/node /仓库绝对路径/magic-resume/scripts/resume-mcp.mjs
codex mcp get magic-resume --json
```

重新加载 MCP 或开启新会话后，使用 `list_resumes`、`get_resume`、`create_resume`、`update_resume`、`delete_resume`。修改会自动同步到网页。通过其他端口启动网页时，同步更新 `MAGIC_RESUME_API_URL`。当前实现为本机 stdio，不能直接作为远程 ChatGPT 的公网 MCP URL。

现在提供 **18 个 MCP 工具**，包括 AI 模型配置/分配/测试、按条目编辑、历史版本比较和恢复；CLI 对应增加 `ai`、`item`、`history`、`version`、`diff`、`restore`、`deleted` 命令。更新后执行 `pnpm db:migrate` 并重新连接 MCP。AI 列表不会返回 API Key，模型测试由后端读取数据库凭据。

完整参数、栏目规则与备份说明见 [CLI 与 MCP 接入](docs/CLI_MCP.md)。

## 💾 数据存储范围

PostgreSQL 是可持久化业务数据的主存储：完整简历（照片、证书内容/链接、富文本、自定义栏目、模板和排版设置）、AI 模型与服务地址、API Key、文字/PDF 模型分配、主题、语言、侧栏状态、最近打开的简历，以及目录名称与授权配置记录。

首次进入本机网页会迁入当前浏览器同地址下的旧配置；确认简历和配置入库后清理旧浏览器副本，数据库保留迁移备份和导入记录。其他地址的旧数据需要在原地址完成迁移。API Key 当前存储于本机数据库 JSONB，数据库备份包含凭据，请仅按私人配置保存；API 限本机访问。

应用不再向 localStorage、sessionStorage、IndexedDB 或 Cookie 写入业务数据。待保存编辑只在当前页面内存中；断网时请恢复连接重试，或在离开前导出，关闭页面后未提交的内存修改无法恢复。浏览器目录授权的 `FileSystemHandle` 无法序列化到 PostgreSQL，句柄也仅保留在内存中，刷新后重新选择同步文件夹；目录元数据仍在数据库中。编辑器撤销/重做、加载状态和临时 AI 检查结果是会话状态；另外提供持久化数据库历史，可用 CLI/MCP 查询和恢复。原始 PDF 文件不会自动作为附件归档到数据库。详见 [数据库存储与 API](docs/DATABASE_STORAGE.md)。

## 📦 构建打包

```bash
pnpm build
```

### AI 厂商网络配置

Cloudflare Workers 使用平台原生 `fetch`，无需配置应用层代理。Node.js 或 Docker 部署在无法直连 OpenAI、Gemini、Anthropic 的地区时，可以设置 `AI_PROXY_URL`；同时兼容 `HTTPS_PROXY` 和 `HTTP_PROXY`。

```bash
AI_PROXY_URL=http://127.0.0.1:7890
```

DeepSeek、通义千问和豆包保持直连。

## 🐳 Docker 部署

`main2DB` 分支目前按本机 Node.js + PostgreSQL 使用；以下原有 Docker 部署尚未配置数据库，不能作为本分支的完整部署方式。数据库 API 也会拒绝非本机连接。

### Docker Compose

1. 确保你已经安装了 Docker 和 Docker Compose

2. 在项目根目录运行：

```bash
docker compose up -d
```

这将会：

- 自动构建应用镜像
- 在后台启动容器



## 📝 许可协议与使用限制

本项目源代码基于 **Apache 2.0** 协议发布，并附带**仅限非商业使用**的额外限制：

- **个人免费**：仅限个人非商业目的（如个人学习交流、制作个人简历）免费使用。
- **禁止商用**：不得将本项目用于任何商业目的，包括将其作为收费或营利性服务（如 SaaS/PaaS）对外提供、用于企业商业运营、转售或进行二次商业化开发，**无论是否修改源代码**。

详情请查看 [LICENSE](LICENSE) 文件。

## 🗺️ 路线图

- [x] AI 辅助编写
- [x] 多语言支持
- [ ] 支持更多简历模板
- [x] 更多格式导出
- [x] 自定义模型
- [x] 自动一页纸
- [x] 导入 PDF, Markdown 等
- [ ] 在线简历托管

## 📈 Star History

<a href="https://star-history.com/#JOYCEQL/magic-resume&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=JOYCEQL/magic-resume&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=JOYCEQL/magic-resume&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=JOYCEQL/magic-resume&type=Date" />
 </picture>
</a>

## 📞 联系方式

可以通过以下方式关注最新动态:

- 作者：SiYue
- X: @GuangzhouY81070
- Discord: 欢迎加入群组 https://discord.gg/9mWgZrW3VN
- 邮箱：18806723365@163.com
  

- 项目主页：https://github.com/JOYCEQL/magic-resume

## 🌟 支持项目

<img src="https://github.com/JOYCEQL/picx-images-hosting/raw/master/pintu-fulicat.com-1741081632544.26lmg2uc2m.webp" width="320"  alt="图片描述">

## ❤️ 赞助名单

<div align="center">
  <h3>Sponsors</h3>
  <p>如果您赞助了本项目，但没展示在这里，请联系我。</p>
  <p>
    <a href="https://github.com/yj147">
      <img src="https://github.com/yj147.png?size=40" width="40" height="40" alt="@yj147" />
    </a>
    <a href="https://github.com/someone1128">
      <img src="https://github.com/someone1128.png?size=40" width="40" height="40" alt="@someone1128" />
    </a>
    <!-- 在这里继续添加赞助者：
    <a href="https://github.com/<username>">
      <img src="https://github.com/<username>.png?size=40" width="40" height="40" alt="@<username>" />
    </a>
    -->
  </p>
</div>
