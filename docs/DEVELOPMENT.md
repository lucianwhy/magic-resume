# ICAN 开发指引

## 安装

```powershell
pnpm install --frozen-lockfile
```

## Web

```powershell
pnpm dev
pnpm build
pnpm start
```

Web 实现位于 `apps/web/`。根命令只是稳定入口。

## CLI

```powershell
$env:MAGIC_RESUME_URL='http://127.0.0.1:3000'
$env:MAGIC_RESUME_API_KEY='<token>'
pnpm resume -- list
pnpm resume -- get <resume-id>
```

CLI 实现位于 `packages/cli/`，不依赖 Web 源码。

## 安装 Skills

默认安装到 Codex：

```powershell
pnpm install:skills
```

安装到 cc-switch：

```powershell
pnpm install:skills -- --target cc-switch
```

目标已存在时脚本停止。确认需要更新后显式增加 `--force`。

## 验证

```powershell
pnpm check
pnpm build
pnpm resume -- --help
```

`pnpm check` 运行当前生产 Web 构建和 CLI 语法检查。全目录 `tsc --noEmit` 暂不作为门槛，因为 Web 仍保留被 TanStack 路由复用的 Next 风格页面类型。

Skill 另用 OpenAI `skill-creator` 的 `quick_validate.py` 校验。
