# ICAN 仓库协作规则

先阅读 `docs/ARCHITECTURE.md`。本仓库同时包含 Web、CLI 和 Skills，但三者必须保持独立模块。

## 模块

- `apps/web/`：网页版 Magic Resume。只通过 HTTP 接口暴露简历能力。
- `packages/cli/`：CLI 客户端。只依赖公开 HTTP 接口，不导入 Web 内部源码。
- `skills/`：可独立安装的 ICAN Skills。不得依赖仓库绝对路径或直接导入 Web/CLI 实现。
- `docs/`：跨模块协议、开发说明。
- `scripts/`：仓库级安装、发布和维护脚本。

## 不可变规则

- 用户职业工作区不属于代码仓库。`.ican/`、`knowledge/`、`jobs/`、`resumes/`、`interviews/` 等由 `$ican-init` 在用户工作目录中创建。
- Web、CLI、Skills 通过稳定接口协作，不共享可变内部文件。
- CLI 命令保持可脚本化：标准输出为 JSON，错误写入标准错误，非零退出码表示失败。
- Skill 名称统一使用 `ican-` 前缀；入口为各目录的 `SKILL.md`。
- 修改目录或接口后，同步更新 `docs/ARCHITECTURE.md`、相关 Skill reference、Docker 和 CI 配置。
- 不提交 `.env`、Token、Cookie、用户简历原件或职业隐私资料。

## 常用验证

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm resume -- --help
```
