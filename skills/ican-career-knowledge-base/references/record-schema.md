# Record schema

Use Markdown records with YAML frontmatter. Keep original material in sources and derived records concise.

## Root layout

~~~
personal-knowledge-base/
  sources/          # original resumes, user messages, files, links, image assets
  facts/            # one record per experience, education, skill, achievement, or identity item
  narratives/       # role-specific reorganizations of confirmed facts
  preferences.md    # city, role, industry, work style, constraints, red lines
  goals.md          # desired direction, learning plans, long-term goals
  open-loops.md     # unanswered high-value questions
  knowledge-base.md # concise index and retrieval map
~~~

## Fact record

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
updated: 2026-08-06
---

# Name

## Confirmed claims
- Atomic claim with source evidence.

## Evidence
- Link, document path, screenshot, or user statement.

## Open loops
- Only questions that materially change future usage.
~~~

## Classification

| Type | Meaning | Example |
|---|---|---|
| fact | Observable experience, result, artifact, date, or responsibility | “独立完成部署” |
| preference | Current choice or constraint | “实习优先郑州中原区” |
| goal | Desired future direction | “想投 AI 智能体开发” |
| reflection | Personal judgment, value, or lesson | “更喜欢贴近用户的问题” |
| unverified | Claim needing evidence or clarification | “粉丝 5000+，统计口径待补” |

## Privacy

- private: store only in the knowledge base.
- interview-only: may use in a private interview-prep context.
- public-with-approval: require user approval before external resume or profile use.

