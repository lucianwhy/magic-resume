# CLI 与 MCP 接入

CLI、MCP 和网页共用 PostgreSQL 简历 API，所有修改按版本提交并同步到网页。当前为本机单人工作区，无需额外数据库密码、Docker 或公网端口。

## 准备服务

```bash
pnpm install
pnpm db:start
pnpm db:migrate
pnpm dev
```

保持网页服务运行。默认 API 是 `http://127.0.0.1:3000`，其他本机端口通过 `MAGIC_RESUME_API_URL` 指定。CLI/MCP 不自行启动数据库或网页，也不直接连接 PostgreSQL。

## CLI

在仓库使用 `pnpm resume --help`。自动化需要纯 JSON 时，直接运行 `node scripts/resume-cli.mjs`；从其他工作目录运行时使用脚本绝对路径。

```bash
pnpm resume list
pnpm resume create --title "我的简历"
pnpm resume get RESUME_ID --section basic,skillContent
pnpm resume get RESUME_ID --include-images
pnpm resume patch RESUME_ID --revision 3 --file patch.json
pnpm resume delete RESUME_ID --revision 4
pnpm resume export RESUME_ID --output resume-backup.json
pnpm resume import --file resume-backup.json
```

ID、版本必须换成真实 `get/list` 的结果。`list` 只输出摘要、版本和网页链接。`get` 默认省略照片和证书 URL，始终省略 `basic.githubKey`。`--file -` 从 stdin 读取 JSON，所有命令接受 `--url http://127.0.0.1:3001`。

更新或删除必须提供正整数 `--revision`。成功 JSON 到 stdout，错误 JSON 到 stderr；成功退出 `0`、冲突退出 `2`、其他失败退出 `1`。无参数或 `--help` 显示帮助。

`patch.json` 示例：

```json
{
  "basic": { "name": "李明", "title": "前端工程师" },
  "skillContent": "<p>熟悉 React、TypeScript 和 PostgreSQL。</p>"
}
```

对象递归合并，数组整组替换，`null` 移除字段，身份和创建/更新日期不能修改。保留数组中未改动的条目及其 ID；已有证书省略的 URL 会按 ID 保留，新证书必须提供 URL。新增栏目还需维护 `menuSections`，见下文。

导出文件包含完整图片和简历内的 GitHub 字段用于恢复，权限设为 `0600`。默认不覆盖已有文件，明确传 `--force` 才覆盖。`--output -` 输出完整 ResumeData 到 stdout。导入接受网页导出的单份 ResumeData、`{ "resume": ... }` 或 ResumeData 数组，使用数据库幂等导入事务；同 ID 不同内容会另存副本，旧备份不自动复活已删记录。

`package.json.bin` 登记了 `magic-resume`、`magic-resume-mcp` 两个入口，可按个人 Node 环境选择 `npm link`；上述命令不需要全局链接。

## MCP

采用官方 [MCP SDK 的 stdio 传输](https://ts.sdk.modelcontextprotocol.io/server#stdio)，由客户端启动子进程。stdout 仅输出协议消息，诊断到 stderr；配置中直接启动 Node，不通过普通 pnpm 脚本日志包装。

| 工具 | 参数与作用 |
| --- | --- |
| `list_resumes` | 无参数，返回摘要、版本和编辑页面地址 |
| `get_resume` | `id`，可选 `sections`、`includeImages`，返回文档和 `revision` |
| `create_resume` | `title`，可选 `locale`、`id`、`patch`、`mutationId`，创建空白经典模板简历 |
| `update_resume` | `id`、`expectedRevision`、`patch`，可选 `mutationId`，局部修改 |
| `delete_resume` | `id`、`expectedRevision`，可选 `mutationId`，软删除 |

资源 `magic-resume://guide` 提供字段和编辑规则。工具按读写、删除性质声明 annotations。输入拒绝原型键、过深 JSON、重复条目 ID 和已知字段的错误类型。

### Codex

按照 [OpenAI 官方 MCP 配置说明](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)：

```bash
codex mcp add magic-resume \
  --env MAGIC_RESUME_API_URL=http://127.0.0.1:3000 \
  -- node /ABSOLUTE/PATH/magic-resume/scripts/resume-mcp.mjs
codex mcp get magic-resume --json
```

GUI 的 PATH 可能不同，必要时将 `node` 换成可执行文件的绝对路径。本机已将 `magic-resume` 登记到 Codex 用户配置；重新加载 MCP 或进入新会话后检查工具列表。仓库移动或 API 端口变化时更新配置。

### 其他本机客户端

生成包含本机 Node、仓库绝对路径的标准 `mcpServers` 配置：

```bash
node scripts/resume-mcp-config.mjs
```

将输出合并到使用该格式的客户端配置中，保留其他服务。配置只包含本机 API 地址，不含数据库密码。入口从其他工作目录启动也会加载仓库自己的 tsconfig 和依赖。

### AI 编辑规则

先 `list_resumes` 确定 ID，再 `get_resume` 读取相关栏目和版本。例如更新目标岗位：

```json
{
  "id": "实际ID",
  "expectedRevision": 3,
  "patch": { "basic": { "title": "前端工程师" } }
}
```

网页可见且无本地待保存修改时会通过轮询显示新内容。若网页有未提交修改，按版本冲突流程处理。富文本使用 HTML，技能字段是 `skillContent`、自我评价是 `selfEvaluationContent`，状态沿用现有拼写 `basic.employementStatus`。

`sections` 可取 `basic`、`education`、`experience`、`projects`、`certificates`、`customData`、`skillContent`、`selfEvaluationContent`、`menuSections`、`globalSettings`。

新建空白简历只有基本信息。新增技能等栏目时，补丁也要维护 `menuSections`，保留已有栏目：

```json
{
  "skillContent": "<p>React、TypeScript</p>",
  "menuSections": [
    { "id": "basic", "title": "基本信息", "icon": "👤", "order": 0, "enabled": true },
    { "id": "skills", "title": "技能", "icon": "🛠️", "order": 1, "enabled": true }
  ]
}
```

冲突必须重新读取并审阅修改，不自动追赶版本覆盖。连接中断时，写入可能已提交，应先查询再决定下一步，不盲目重复新建。新建失败会附 `resumeId`，方便核对；`mutationId` 标识一次写入，不能用于不同修改。底层 API 幂等重试要求完全相同的原始请求，CLI/MCP 的读后合并不等同于重放原请求。

## 验证

```bash
pnpm test:agent
pnpm test:ai
pnpm build
```

`test:agent` 使用独立随机 PostgreSQL 测试库、独立网页服务和合成简历，验证真实 stdio 初始化、工具/资源发现、CLI stdin/导入导出、CLI/MCP 与网页双向同步、秘密字段保留、冲突和删除。两个入口还从仓库外的工作目录启动；结束后删除测试库。产物在被 Git 排除的 `.local/agent-tests`。

当前 MCP 为本机 stdio，不是远程 ChatGPT 连接器的公网 HTTP 地址。远程、多用户接入需要另外实现认证、数据权限和部署。

## AI 配置、条目编辑与历史版本

执行 `pnpm db:migrate` 应用 `004-resume-history`。更新代码后重新连接 MCP；工具由 5 个扩展为 18 个。现有注册命令和入口不变。

### AI 模型管理

```bash
pnpm resume ai providers
pnpm resume ai list
pnpm resume ai save --revision 0 --storage-id WORKSPACE_UUID --file profile.json
pnpm resume ai assign --task text --model-id MODEL_PROFILE_ID --revision 1 --storage-id WORKSPACE_UUID
pnpm resume ai test --model-id MODEL_PROFILE_ID --kind text
pnpm resume ai discover --model-id MODEL_PROFILE_ID
```

`WORKSPACE_UUID`、版本号和模型配置 ID 必须来自最新的 `ai list`。模型配置 ID 与服务商的模型名称不同。`profile.json` 例如：

```json
{"id":"my-qwen","provider":"qwen","name":"文字与视觉助手","model":"qwen3-vl-plus","apiKey":"你的密钥"}
```

也可用 `--file -` 从 stdin 输入；包含凭据的文件只供本机配置使用。更新传入 `id` 和需要修改的字段，省略 `apiKey` 会保留原 Key；空字符串会清除 Key。删除模型用 `ai delete`；取消任务分配用 `ai assign --model-id none`。列表与写入结果都不返回 Key，只返回 `hasApiKey` / `configured`。

对应工具为 `list_ai_providers`、`list_ai_models`、`save_ai_model`、`delete_ai_model`、`assign_ai_model`、`test_ai_model`、`discover_ai_models`。写入参数为 `expectedRevision`、`storageId` 和可选 `mutationId`。测试和服务商模型发现仅传已保存的 `modelId`，后端从 PostgreSQL 读取凭据；文字测试检查 OK，PDF 测试让视觉模型识别随机数字图片。测试会实际访问已配置服务商并可能产生调用费用。

### 精确编辑条目

```bash
pnpm resume get RESUME_ID --section experience
pnpm resume item RESUME_ID --revision CURRENT_REVISION --file operation.json
```

只改一段经历的公司名称：

```json
{"section":"experience","action":"update","itemId":"EXISTING_ITEM_ID","item":{"company":"科大讯飞"}}
```

对应工具 `edit_resume_item` 的 `operation` 使用上述结构。支持 `add`、`update`、`remove`、`reorder`；更新/删除传 `itemId`，新增传 `item`，排序传完整 `itemIds` 数组。新增省略 ID 时自动生成，结果里返回完整栏目中的新 ID。重排必须恰好包含所有现有 ID，禁止通过更新改变条目 ID。

支持 `education`、`experience`、`projects`、`certificates`、`menuSections`、`basic.customFields`、`basic.fieldOrder`、`customData.SECTION_ID`。新增自定义栏目正文后，还需添加相应 `menuSections` 条目使其可见。条目操作在数据库事务中合并，不要求客户端重发整个栏目，并保留未修改的字段、照片和 Key。

### 历史、比较与恢复

```bash
pnpm resume history RESUME_ID --limit 25
pnpm resume version RESUME_ID --version HISTORICAL_REVISION
pnpm resume diff RESUME_ID --from OLD_REVISION --to NEW_REVISION
pnpm resume restore RESUME_ID --version HISTORICAL_REVISION --revision CURRENT_REVISION
pnpm resume deleted
```

对应工具 `list_resume_history`、`get_resume_version`、`diff_resume_versions`、`restore_resume_version`、`list_deleted_resumes`。历史分页用 `nextBefore` 再传 `before`；比较返回变化字段路径，不返回凭据或正文值。历史正文默认隐藏图片和 GitHub Key，图片可显式选择包含。

数据库触发器在同一事务中记录网页、CLI、MCP 的新建、修改、导入、删除及恢复。`source` 是入口标签（web/cli/mcp），不是用户身份认证。恢复需要当前版本号，写成新的递增版本，不删除旧历史；同样可恢复已删除简历。编辑器撤销/重做仍属于当前页面会话，数据库历史独立保留。

迁移时已有简历只建立当前版本的 `baseline` 快照，无法重建迁移前没有保存的旧版本。历史包含完整正文与凭据，存放在数据库中，不复制到浏览器；目前每次提交保留完整快照，没有自动清理。数据库备份也包含这些快照。
