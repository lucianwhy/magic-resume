---
name: ican-job-resume
description: 根据岗位 JD，从个人职业知识库检索可验证事实，生成不覆盖原件的定制简历版本，并通过 Magic Resume CLI 创建、同步、导出和验证。用于粘贴招聘 JD、按岗位优化简历、检查经历表述是否有证据、创建新的云端简历版本、限制页数，或验收网页预览与 PNG/PDF 是否一致时。
---

# 岗位定制简历

将本 Skill 作为岗位定制流水线，不作为无依据的文案润色器。遵守以下不可变规则：

- 只写可追溯事实；每条新增或强化表述必须映射 `fact_id`。
- 缺少证据时，标为“需确认”，不得补造技术、职责、指标或结果。
- 永不静默覆盖原简历、原 JSON 或云端简历；新版本使用唯一 ID。
- 导出只在真实渲染链路验收通过后交付。

## 工作区入口

1. 优先使用用户明确给出的 ICAN 工作区；否则从当前目录逐级向上查找 `.ican/project.json`。
2. 找不到项目标识时调用 `$ican-init`。初始化目录、`AGENTS.md`、`CLAUDE.md` 和 Git 隐私规则使用安全默认值，不为这些事项打断用户。
3. 读取 `.ican/AI_CONTEXT.md` 和 `.ican/state.json`，再查找知识库、源简历和目标 JD。
4. 用户有简历但尚未导入时，先交给 `$ican-career-knowledge-base` 作为来源导入和核验；用户没有简历时，先由该 Skill 分步建立基础职业档案。
5. 目标岗位或简历方向未知时，只问这一个关键问题；已经从 JD 或上下文得知时不得重复询问。

## 资源路由

按任务读取，不要一次加载全部资料：

| 任务 | 必读资源 | 可执行脚本 |
| --- | --- | --- |
| 分析 JD | `references/jd-taxonomy.md` | `scripts/parse_jd.py` |
| 判断表述能否写入 | `references/evidence-ledger.md`、`references/project-facts.md` | `scripts/score_evidence.py` |
| 生成匹配报告、关键词分级或改写候选稿 | `references/writing-rubric.md`、`references/resume-schema.md`、`references/tailoring-deliverables.md` | `scripts/diff_resume.py` |
| 云端创建、同步、导出 | `references/magic-resume-cli.md` | — |
| 页数、PDF、PNG、网页一致性 | `references/render-acceptance.md` | `scripts/verify_export.py` |

个人事实优先从 `$ican-career-knowledge-base` 查询；本 Skill 的 references 只保存简历专用的结构、事实索引和规则。不要把完整聊天记录、截图或过期简历复制进 Skill。

## 工作流

### 1. 建立输入边界

收集 JD 原文、目标职位、源简历标识、源简历所在浏览器与 Profile、用户要求。若用户要求新版本在浏览器显示，源浏览器可执行文件是必填输入；若源简历不在浏览器默认 Profile，Profile 也是必填输入。目标必须与源简历当前可见的浏览器/Profile 相同；不得猜测系统默认浏览器或改用其它浏览器。未给 JD 时，只输出诊断或首份简历，不声称“岗位定制”。

将 JD 结构化为：目标角色、硬性要求、加分项、职责、行业/地点约束、关键词。运行：

```powershell
python "$env:USERPROFILE\.codex\skills\ican-job-resume\scripts\parse_jd.py" --input jd.txt --output jd-analysis.json
```

### 2. 证据优先匹配

读取相关项目事实与证据台账。对每项 JD 输出四类结论：

- `supported`：已有证据，可写入。
- `partial`：事实相关，但不能等价承诺。
- `needs_confirmation`：可能具备，需用户确认。
- `unsupported`：无证据，不写入简历。

生成候选稿前，按 `references/tailoring-deliverables.md` 给出岗位要求—证据矩阵和关键词分级，再汇总强匹配、可改写点、待确认点、不可写点。

### 3. 生成新版本

保留源简历不变。为候选稿创建新文件和新云端 ID，例如：

```text
wang-haoyue-ai-agent-engineer-v2
```

每个变更按 `references/tailoring-deliverables.md` 保留改写矩阵和修改日志：原文、候选文案、匹配 JD、`fact_ids`、理由、风险。使用 `references/writing-rubric.md` 改写。不要以“补关键词”为由新增不存在的能力。

运行差异检查：

```powershell
python "$env:USERPROFILE\.codex\skills\ican-job-resume\scripts\diff_resume.py" --base resume.json --candidate targeted.json --output resume-diff.json
```

### 4. 通过 Magic Resume CLI 交付

只有用户明确要求云端操作时，读取 `references/magic-resume-cli.md` 并使用第一方 CLI。先 `list/get`，再 `create`；同 ID 失败即停止，不替换原件。AI 处理结果仍是候选内容，必须通过证据校验后才写入。

CLI 优先级为：服务端写入、服务端回读、真实渲染导出。不得为了“导入简历”打开浏览器、上传 JSON、点击“导入简历”或调用文件选择器。

候选 JSON 的来源无关：本地生成、云端导出或其它环境均可。浏览器本地存储按浏览器和 Profile 隔离，因此服务端/本机 CLI 回读成功不等于其它浏览器已显示。

若用户明确要求浏览器立即显示新版本，执行下列固定链路，且全程只用 CLI：

1. `get <source-id>`，记录源版本及其当前可见的浏览器路径/Profile。
2. 在本地复制源 JSON，使用新唯一 ID 写出候选 JSON；基于 JD 和事实台账修改候选稿，不改源文件。
3. `put <candidate.json>`，再 `get <candidate-id>` 回读验证。
4. 用 `import-browser <candidate-id>` 仅签发短期一次性导入链接；不让 CLI 自动打开默认浏览器。
5. 用明确指定的源浏览器可执行文件与同一 Profile 启动该链接，例如：

```powershell
E:\ican\scripts\magic-resume-browser-import.ps1 `
  -InputJson <candidate.json> `
  -BrowserExecutable 'C:\Program Files\Google\Chrome\Application\chrome.exe' `
  -BrowserProfile 'Default'
```

默认 Profile 也应显式传 `Default`；仅在已确认源简历就在浏览器默认 Profile 时才可省略。该脚本只把链接交给指定浏览器；页面自行拉取并写入该 Profile 的本地存储。不得使用浏览器自动化、文件选择器、上传 JSON、点击“导入简历”，也不得用系统默认浏览器替代源浏览器。用户未明确要求页面可见时，完成 CLI 回读即交付。

### 5. 验收导出与页数

用户要求 PNG、PDF、页数或“与网页完全一致”时，读取 `references/render-acceptance.md`。必须用同一真实工作台渲染链路生成网页截图、PNG 和 PDF；不接受手写 HTML 或另一套模板作为交付基准。

运行：

```powershell
python "$env:USERPROFILE\.codex\skills\ican-job-resume\scripts\verify_export.py" --report export-report.json --max-pages 1
```

失败时报告具体原因：页数超限、裁切、内容不一致、输入版本不一致或渲染器不一致。不得仅通过缩小字号强行压页；先建议压缩可确认的冗余表述。

## 输出包

每次岗位定制至少交付：

1. `jd-analysis.json`：岗位要求和关键词。
2. `fit-report.md`：岗位要求—证据矩阵、关键词分级、匹配、缺口、待确认、不可写项。
3. `targeted-resume.json`：新候选稿，不覆盖源文件。
4. `resume-diff.json`：逐字段改写矩阵和 `fact_ids`。
5. `change-log.md`：修改内容、原因、证据、对应要求和遗留问题。
6. `validation-report.json`：证据和导出验收结果。

云端操作另交付：新简历 ID、源 ID、导出本地绝对路径、页数及验收结论。
