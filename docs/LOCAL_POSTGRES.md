# 本地 PostgreSQL

本项目的开发数据库使用原生 PostgreSQL 17.10，不需要 Docker、Homebrew 或管理员权限。二进制由固定版本的 `embedded-postgres` npm 包提供；包版本中的 `beta` 指 Node 封装发布版本，数据库引擎版本可通过 `db:status` 实测。

```bash
pnpm db:start
pnpm db:status
pnpm db:check
pnpm db:migrate
pnpm db:stop
```

首次启动自动在 `tools/local-postgres` 安装独立的运行依赖、初始化数据库并生成随机密码。也可先手动运行 `npm ci --prefix tools/local-postgres`。无需先安装整个网页应用的依赖。

也可以直接执行 `node scripts/postgres-local.mjs start`（其他命令同理）。项目 `pnpm-workspace.yaml` 关闭 pnpm 执行脚本前的隐式安装；网页依赖仍通过显式 `pnpm install` 安装。

默认连接地址是 `127.0.0.1:5432`，数据库和本地开发角色均为 `magic_resume`，使用 SCRAM 密码认证。角色只用于这个独立开发实例，生产环境应使用单独配置的应用角色。

连接字符串保存在仓库根目录 `.env.local` 的 `DATABASE_URL`；本地配置和密码位于 `.local/postgres/config.json`。这些文件已经排除在 Git 和仓库图扫描之外。脚本保留原有环境变量，遇到不同的 `DATABASE_URL` 时停止并报告，不覆盖配置。

如默认端口已被其他服务使用，在**首次启动前**选择其他端口：

```bash
MAGIC_RESUME_PG_PORT=55432 pnpm db:start
```

初始化后使用配置文件中的端口。数据库数据位于 `.local/postgres/data`，日志位于 `.local/postgres/postgres.log`。启动命令完成后数据库继续在后台运行，停止及再次启动都会保留数据；重启电脑后需要重新执行 `pnpm db:start`。

`db:check` 验证实际 TCP 连接、UTF-8 中文和 JSONB 读写，检查使用临时表并回滚。数据库只监听本机 IPv4 地址。

网页简历现已保存到 PostgreSQL。安装网页依赖后执行 `pnpm db:migrate` 建表，再执行 `pnpm dev`；首次进入简历页面会导入当前浏览器、当前网站地址下的旧简历，原始浏览器数据保留为备份。详细行为与 API 见 [数据库存储](DATABASE_STORAGE.md)。数据库迁移脚本可重复运行，不自动删除已有简历。

已验证环境：macOS / Apple Silicon / Node.js 24。其他系统需要相应平台的 npm 二进制包，尚未完成实际运行验收。
