# 中文仓库知识图谱

本仓库使用 [Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) 的官方分析流水线生成交互知识图谱。

## 分析与更新

已安装的 Codex skill 位于 `~/.agents/skills/understand`。在仓库中调用（`<PROJECT_ROOT>` 替换成仓库绝对路径，本机为 `/Users/lucian/Desktop/magic-resume`）：

```text
$understand <PROJECT_ROOT> --full --language zh --no-auto-update
```

首次扫描前审阅 `.ua/.understandignore`；保留源码、配置、文档、测试，排除依赖、构建产物、环境凭据、本地 PostgreSQL 数据及 OTF/WebP 二进制资源。图谱采用官方扫描、Tree-sitter 结构提取、语义分批、批次合并、架构分层、学习导览、校验及结构指纹过程。结构提取和语义分析由本地 skill 与当前 AI 会话完成，无须配置额外外部模型 API key。

结果位于 `.ua/knowledge-graph.json`；`.ua/meta.json` 记录分析版本和时间，`.ua/fingerprints.json` 保存未来增量分析基线，`.ua/intermediate/scan-result.json` 保存扫描清单。`.ua/config.json` 设置中文输出并关闭自动提交更新。

当前图谱是数据库存储迁移前的基线，包括 `main2DB` 分支当时未提交的 PostgreSQL 开发配置；尚未包含随后新增的数据库/API/同步模块。`gitCommitHash` 是分析时的基础提交，不能单独表达工作区新增内容；具体库存和内容基线由扫描清单与结构指纹补充。需要查看最新架构时重新运行分析，更新关系和导览。

## 打开交互图

在 Codex 中调用：

```text
$understand-dashboard <PROJECT_ROOT>
```

也可以使用本机已经安装依赖的官方 dashboard：

```bash
cd "$HOME/.understand-anything/repo/understand-anything-plugin/packages/dashboard"
GRAPH_DIR="<PROJECT_ROOT>" pnpm exec vite --host 127.0.0.1
```

打开输出中的完整 `Dashboard URL`，必须保留 `?token=` 参数。服务只监听本机地址；在终端按 `Ctrl+C` 停止。访问令牌随服务重启变化，不写入仓库文档。

图谱中的调用和语义关系来自静态结构与源码分析；它不替代运行时跟踪，也不表示已验证每一条业务流程。
