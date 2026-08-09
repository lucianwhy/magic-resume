# ICAN 工作区协议

## 项目标识

所有 ICAN Skill 使用 `.ican/project.json` 识别项目，不用文件夹名称猜测。

查找顺序：

1. 用户明确给出的 ICAN 工作区路径。
2. 当前目录的 `.ican/project.json`。
3. 从当前目录逐级向上查找。
4. 仍未找到时调用 `$ican-init`，不得由业务 Skill 私自创建另一套目录。

## 共享状态

- `.ican/project.json`：项目 ID、协议版本、创建时间。
- `.ican/state.json`：资料入口、目标岗位和各流程准备度。
- `.ican/AI_CONTEXT.md`：跨 AI 客户端共享的事实边界和 Skill 路由。
- `AGENTS.md`：Codex 项目指令入口。
- `CLAUDE.md`：Claude Code 项目指令入口。

`AGENTS.md` 和 `CLAUDE.md` 都应指向 `.ican/AI_CONTEXT.md`，不要复制完整规则。

## 目录职责

| 路径 | 用途 |
| --- | --- |
| `knowledge/` | 职业事实、来源、待补问题 |
| `jobs/` | 目标岗位和 JD |
| `resumes/` | 原始简历、候选版本、差异报告 |
| `interviews/` | 分岗位、分轮次的培训材料 |
| `exports/` | 可交付产物 |
| `private/` | 不应进入 Git 的敏感材料 |

## 写入规则

- 初始化脚本只补齐结构，不覆盖已有业务数据。
- 敏感内容默认进入 `private/` 或明确标记为私有。
- 简历是来源，不是天然可信的事实总表。
- 业务 Skill 更新状态时只修改自己负责的字段。
- 未知信息使用 `missing`、`unknown` 或待补问题，不伪造完成状态。
