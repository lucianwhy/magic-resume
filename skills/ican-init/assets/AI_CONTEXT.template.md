# ICAN 共享 AI 上下文

本目录是 ICAN 职业工作区。所有 AI 客户端和 `ican-*` Skill 共用以下约束。

## 读取顺序

1. 读取 `.ican/project.json` 和 `.ican/state.json`。
2. 读取 `knowledge/overview.md`、`knowledge/open-loops.md` 和当前任务相关记录。
3. 只加载当前岗位、简历或面试阶段需要的资料。

## 事实边界

- 用户原话、简历和附件属于来源，不自动等于已核实事实。
- 不编造技术、职责、指标、时间、奖项或工作经验。
- 未知内容标记为待确认；培训示例不得回写为用户经历。
- 新事实只有经用户确认后才能进入长期职业知识库。

## Skill 路由

- 建档、补充、查询事实：`$ican-career-knowledge-base`
- 根据 JD 创建新简历版本：`$ican-job-resume`
- 四轮面试前培训：`$ican-interview-prep-coach`
- 工作区缺失或损坏：`$ican-init`

## 交付边界

- 原始简历和来源文件不得静默覆盖。
- 敏感材料默认放入 `private/`，不得进入公开输出。
- 每轮结束给出一个明确的下一步，不把工具选择负担交给用户。
