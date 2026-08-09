---
name: ican-init
description: 初始化、识别或修复 ICAN 职业工作区，并为 Codex、Claude Code 等 AI 工具建立共享上下文。用于用户从空白目录开始使用 ICAN、首次导入已有简历或职业资料、没有简历需要分步建档、其他 ICAN Skill 找不到 .ican/project.json，或需要检查现有工作区完整性时。
---

# ICAN 初始化

只负责建立可被全部 `ican-*` Skill 识别的工作区，并把用户引导到下一项业务任务。

## 工作流

1. 读取 `references/onboarding.md`，判断全新开始或导入已有资料。
2. 直接运行 `scripts/init_workspace.py`。默认使用当前目录；处于用户主目录或磁盘根目录时，自动创建 `ican-career-workspace/`。不要为目录位置或 Git 保护设置询问用户。
3. 读取 `references/workspace-protocol.md`，确认 `.ican/project.json`、共享 AI 上下文和隐私规则。
4. 运行 `scripts/doctor_workspace.py`。检查失败时修复缺失项，不得声称初始化成功。
5. 读取 `references/routing.md`，只对“导入已有资料还是全新建档”和“目标岗位/简历方向”进行必要引导，然后交给对应 `ican-*` Skill。

## 约束

- 默认创建 `AGENTS.md` 和 `CLAUDE.md`；两者只承载入口规则，共同指向 `.ican/AI_CONTEXT.md`。
- 已有同名文件时追加 ICAN 管理块，不覆盖用户原有内容。
- 默认写入 `.gitignore` 保护 `private/` 等敏感目录，只告知结果。
- 不把简历内容自动视为已核实事实；导入后交给 `$ican-career-knowledge-base` 建档和核验。
- 不在初始化阶段生成定制简历或开展面试培训。
- 重复执行必须幂等：保留已有数据，只补齐缺失结构。

## 命令

```powershell
python scripts/init_workspace.py
python scripts/doctor_workspace.py --root <workspace>
```

完成后报告：工作区绝对路径、创建/保留内容、资料状态、目标岗位状态、唯一推荐的下一步。
