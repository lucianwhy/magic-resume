# 数据库存储与本机 API

`main2DB` 使用 PostgreSQL 作为简历的主存储。网页、CLI、MCP 都通过同一组服务端接口读写，避免直接修改浏览器缓存。当前实现是本机单人工作区；使用方法见 [CLI 与 MCP 接入](CLI_MCP.md)。

## 启动

```bash
pnpm install
pnpm db:start
pnpm db:migrate
pnpm dev
```

无需 Docker。原生 PostgreSQL 的密码、端口、启停与数据目录见 [本地 PostgreSQL](LOCAL_POSTGRES.md)。自备 PostgreSQL 时设置 `DATABASE_URL`，再执行 `pnpm db:migrate`。本地开发脚本需要能创建测试数据库的角色；正式应用应另设受限角色。

构建后可以通过 `pnpm build`、`pnpm start` 运行 Node.js 服务。开发和生产服务默认监听 `127.0.0.1`，`server.mjs` 自动加载 `.env.local`。迁移必须在启动网页前执行；不会在每次 API 请求时自动建表。

## 保存与旧数据迁移

- 进入 `/app` 后，先加载数据库，再显示简历。编辑操作在内存中即时更新，约 400 毫秒后串行保存，保存状态显示在页面右下方。
- 首次进入时读取旧 `localStorage["resume-storage"]`，整个导入批次通过一个数据库事务提交。数据库在同一事务中保留旧文档作为迁移备份；确认成功后删除原始浏览器键。
- 导入记录保存在数据库中。重复导入同一份旧内容不会重复创建；遇到同 ID 的不同简历会另存“迁移副本”，保留数据库原件。删除记录保留墓碑，旧备份不会将其自动复活。
- 应用不再往 localStorage、sessionStorage、IndexedDB 或 Cookie 写入业务数据。未保存编辑只在当前页面内存中；连接失败时显示未保存，离开前提示并可导出，关闭页面后无法从浏览器恢复。已有旧 `resume-db-outbox-v1` 只读入一次，全部提交或明确处理冲突后才清理；未提交成功前保留旧队列。迁移标记也不再写入。
- 网页可见时每两秒检查数据库版本，返回页面或恢复联网时也会同步。版本未变时使用 ETag/304，避免反复下载照片和正文。没有待保存编辑时才应用远端内容。
- 写入带版本号，另一端先提交时返回 `409`。页面允许“保留我的修改为副本”或“采用数据库版本”，不会自动覆盖冲突内容。
- 已配置 JSON 目录仍可用作导出/备份；不再在启动时自动读入目录覆盖数据库。“设置”中的主动目录导入会作为普通编辑保存。
- 简历文档中的照片、证书内容/链接、富文本、模板设置、自定义栏目完整保存在 JSONB 中。原始 PDF 文件不会自动作为附件归档。
- AI 模型配置、API Key、服务地址、文字/PDF 模型分配存入 `workspace_settings`；语言、主题、侧栏状态、最近打开的简历、目录名称与授权元数据也存入数据库。
- 首次进入页面事务导入此地址的旧 AI 配置，保留已存在模型及其分配；同 ID 不同配置另设 ID，完全相同的配置去重。数据库导入账本保存迁移备份，成功后移除浏览器 `ai-config-storage`，以后不再写入此键。账本避免删除模型后被旧浏览器配置复活。旧主题/最近简历缓存、语言/侧栏 Cookie 在迁入配置后清理，以后只从数据库读取。
- AI Key 当前保存在本机 JSONB 中，数据库及迁移备份包含凭据，不在日志、MCP 简历工具或冲突错误中输出；数据库备份需按私人配置保管。当前仅本机单人工作区，尚未实现静态加密、多用户授权或远程配置访问。
- 目录配置和授权时间可以入库，但 `FileSystemHandle` 是浏览器绑定的能力句柄，不能 JSON 序列化到数据库并恢复权限。句柄仅保留在页面内存，每次使用仍核验浏览器权限；刷新或换浏览器需重新选择同步文件夹。旧 IndexedDB 中的目录元数据迁入后删除 `FileHandleDB`，不再新建此库。数据库取消配置后不会继续使用旧句柄。撤销/重做、临时 AI 检查结果仍是会话状态。
- 配置按栏目版本串行保存，冲突显示“导出配置”与“采用数据库版本”，不覆盖其他页面的更改。未保存配置暂存内存，离开前提示并可导出（文件含 Key）；配置不再复制到 localStorage。网络中断可重试同一写入；数据库标识改变时阻止旧配置写入新库。

浏览器存储隔离到协议、主机和端口。线上域名、`localhost:3000`、`127.0.0.1:3000` 互不共享。若旧数据在另一地址，请在旧站导出 JSON，再通过本地网页导入；无法直接读取另一个网站的浏览器数据。导入未确认成功前保留旧数据和导出文件。

## 数据模型

| 表 | 用途 |
| --- | --- |
| `resume_documents` | 完整 JSONB 文档、单调递增版本、时间、删除墓碑、最近一次写入的幂等标识 |
| `resume_workspace` | 数据库工作区唯一标识，用于发现数据库更换并阻止旧恢复队列自动覆盖新库 |
| `resume_legacy_imports` | 旧数据的来源 ID、内容摘要、导入目标 ID、原文档迁移备份（包括因删除墓碑跳过的内容） |
| `magic_resume_schema_migrations` | 已应用的建表版本与校验和 |
| `workspace_settings` | AI 配置、偏好、目录元数据的 JSONB、版本与幂等写入标识 |
| `workspace_settings_imports` | 旧 AI 配置的内容摘要、迁移备份，防止反复导入或复活已删配置 |

建表是可重复执行的事务迁移；同版本 SQL 改动会因校验和不同被拒绝。后续结构变化应增加新的迁移版本。

## API

接口当前只接受本机主机名与本机网络连接，浏览器请求还校验 Origin / Sec-Fetch-Site。公开域名或容器转发的远端连接会被拒绝；当前没有用户登录、团队隔离和公网 API token，不能直接用于多人部署。此实现依赖 Node.js 的 `pg`，没有为 Cloudflare Workers 配置数据库连接适配。

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | `/api/resumes/` | 返回 `{ storageId, resumes: [{ resume, revision }] }`，支持 `If-None-Match` |
| GET | `/api/resumes/:id` | 读取一份 `{ resume, revision }`；缺失/已删除返回 404 |
| PUT | `/api/resumes/:id` | 创建或更新完整文档，正文 `{ resume, expectedRevision, mutationId }` |
| DELETE | `/api/resumes/:id` | 软删除，正文 `{ expectedRevision, mutationId }` |
| POST | `/api/resumes/` | 事务导入旧数据，正文 `{ resumes: ResumeData[] }` |

新建使用 `expectedRevision: 0`，已有记录使用 GET 返回的版本。每次不同的修改生成一个新 UUID `mutationId`；超时后重试同一次请求时保留原 UUID 和原正文。当前保存最近一次幂等写入，期间若另一端又提交了版本，旧请求会产生版本冲突。数据库生成更新日期、保留已有创建日期。

以下示例在项目目录中执行，修改一份真实简历的标题；先把 `ID` 换成 GET 列表中的简历 ID：

```bash
ID=your-resume-id node --input-type=module <<'JS'
import { randomUUID } from 'node:crypto';
const endpoint = `http://127.0.0.1:3000/api/resumes/${encodeURIComponent(process.env.ID)}`;
const read = await fetch(endpoint);
if (!read.ok) throw new Error(`Read failed: ${read.status}`);
const current = await read.json();
const result = await fetch(endpoint, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    resume: { ...current.resume, title: 'AI 修改后的标题' },
    expectedRevision: current.revision,
    mutationId: randomUUID(),
  }),
});
if (!result.ok) throw new Error(`Write failed: ${result.status}; ${await result.text()}`);
console.log('Saved revision:', (await result.json()).revision);
JS
```

正文限制 32 MiB，旧数据导入单批最多 500 份。错误返回 `{ code, current? }`；`revisionConflict` 的 `current` 为当前版本或 `null`，调用者必须处理冲突，不得无条件重试覆盖。CLI/MCP 复用这些 API，并要求传入已读取的版本号。

## 工作区配置 API

同样限定本机连接与同源请求，响应不缓存。不要将完整响应复制到日志，因为其中包含 AI Key。当前简历 CLI/MCP 工具不读取这些配置。

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | `/api/workspace/` | 返回 `{ storageId, entries: { [key]: { value, revision } } }` |
| POST | `/api/workspace/` | 事务导入 `{ ai?, preferences?, "file-sync"? }`，数据库已存在配置优先 |
| PUT | `/api/workspace/:key` | 正文 `{ value, expectedRevision, mutationId, storageId }`，校验数据库标识与版本 |

仅允许 `ai`、`preferences`、`file-sync` 三种配置。配置请求限制 1 MiB，AI 模型最多 128 项。`settingsConflict` 返回 `409`，错误不携带包含 Key 的当前配置。`databaseChanged` 表示请求指向不同工作区，需要先导出未保存修改再重新加载。

## 验证

```bash
pnpm db:start
pnpm test:storage
pnpm test:workspace
pnpm install:playwright
pnpm test:storage-browser
pnpm test:ai
pnpm build
```

数据库测试创建独立的随机测试库，结束后删除，只使用合成简历。覆盖事务回滚、幂等导入/写入、并发冲突、删除墓碑和条件轮询。同步单元测试覆盖编辑与回包竞争、旧轮询、断线恢复及数据库更换。Chromium 验收还验证真实富文本编辑、刷新、全新浏览器读取、外部 API 更新、旧队列提交与清理、断线内存重试、离开提示、浏览器无业务持久化、撤销及冲突副本。

浏览器测试产物位于被 Git 排除的 `.local/storage-tests`。此验收证明存储链路可用，不表示自动取得或迁移了其他线上域名下的用户简历。
