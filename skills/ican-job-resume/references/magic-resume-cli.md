# Magic Resume CLI 操作约定

仅在用户明确授权云端操作后执行。优先读取当前容器项目的 CLI `--help`，再使用已验证命令；不要凭本文件猜测未来接口。

操作顺序：

1. `list` 或 `get <source-id>`：确认源版本。
2. 本地生成候选 JSON、差异报告与证据校验。
3. `put <candidate.json>`：创建新 ID。ID 已存在时停止。
4. `get <candidate-id>`：确认服务端内容。
5. 导出并按 `render-acceptance.md` 验收。

## 浏览器可见性（可选）

候选 JSON 可以来自本地生成、云端导出或其它环境。浏览器可见性主路径始终是“本地 JSON → 本机暂存服务 → 指定浏览器/Profile”，不依赖固定云服务器。

先确认源简历在哪个浏览器和 Profile 中可见。新版本必须导入同一个浏览器/Profile；Chrome、Edge 和不同 Chrome Profile 的本地存储互不共享。浏览器可执行文件必须明确传入；源简历不在默认 Profile 时，Profile 也必须明确传入。不得按系统默认浏览器猜测目标。

若且仅若用户要求该浏览器立即显示新版本，运行：

```powershell
E:\ican\scripts\magic-resume-browser-import.ps1 `
  -InputJson <candidate.json> `
  -BrowserExecutable '<source-browser.exe>' `
  -BrowserProfile '<source-profile>'
```

默认同 ID 已存在时失败，须显式 `-AllowReplace` 才可替换。脚本先经 CLI 写入和回读，再创建短期、单次、绑定简历 ID 的导入链接，并仅用指定的浏览器可执行文件和 Profile 打开它；页面自行从本机服务读取。CLI 仅负责传输与启动链接，不控制浏览器页面。默认 Profile 建议显式写 `Default`；仅在已确认源简历就在浏览器默认 Profile 时才可省略。不要用自动化上传 JSON 或 `fileChooser.setFiles`，也不要在未指定浏览器/Profile 时猜测目标。

禁止事项：

- 未经明确授权运行覆盖、删除、批量替换。
- 将 API token、Cookie、私密联系方式写入 Skill 文件。
- 把浏览器显示结果当作服务端写入成功的唯一证据。
