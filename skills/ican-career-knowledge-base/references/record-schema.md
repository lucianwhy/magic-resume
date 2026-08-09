# 记录结构

使用带 YAML frontmatter 的 Markdown 记录。原始材料保存在 `sources`，派生记录保持简洁。

## 根目录布局

~~~
personal-knowledge-base/
  sources/          # 原始简历、用户消息、文件、链接、图片素材
  facts/            # 每段经历、教育、技能、成就或身份信息各一条记录
  narratives/       # 针对岗位重新组织的已确认事实
  preferences.md    # 城市、岗位、行业、工作方式、约束和底线
  goals.md          # 目标方向、学习计划和长期目标
  open-loops.md     # 尚未回答的高价值问题
  knowledge-base.md # 简洁索引和检索地图
~~~

## 事实记录

~~~
---
id: project-grade-radar
type: project
status: confirmed
source_refs:
  - sources/resume-export-2026-08-06.json
privacy: private
role_lenses:
  - engineering
  - product
  - delivery
tags:
  - fastapi
  - education
related_records:
  - id: skill-rag
    relation: demonstrates
supports:
  roles:
    - ai-agent-engineer
  interview_stages:
    - technical
    - project
  resume_sections:
    - projects
open_loops:
  - question: 使用了什么检索评估方法？
    value: 区分实现经验与优化经验。
    priority: high
updated: 2026-08-06
---

# 名称

## 已确认声明
- 带来源证据的原子声明。

## 证据
- 链接、文档路径、截图或用户陈述。

## 待补问题
- 仅记录会实质改变未来使用方式的问题。
~~~

## 分类

| 类型 | 含义 | 示例 |
| --- | --- | --- |
| `fact` | 可观察的经历、结果、产物、日期或职责 | “独立完成部署” |
| `preference` | 当前选择或约束 | “实习优先郑州中原区” |
| `goal` | 期望的未来方向 | “想投 AI 智能体开发” |
| `reflection` | 个人判断、价值观或经验总结 | “更喜欢贴近用户的问题” |
| `unverified` | 需要证据或澄清的主张 | “粉丝 5000+，统计口径待补” |

## 隐私级别

- `private`：仅存于知识库。
- `interview-only`：仅可在私密面试准备场景使用。
- `public-with-approval`：用于外部简历或公开资料前，必须取得用户同意。

## 可选关联字段

- `related_records`：仅连接实质相关记录。每项包含稳定记录 `id` 和简短关系，例如 `part_of`、`demonstrates`、`evidence_for` 或 `related_to`。
- `supports`：索引已确认事实可用于哪些目标岗位、面试阶段或简历模块。它只是检索提示，不代表公开授权。
- `open_loops`：仅保存高价值待补问题，同时记录预期价值和优先级。不要把每个空字段都变成待补问题。

创建这些字段或更新根索引前，读取 [linking-and-open-loops.md](linking-and-open-loops.md)。
