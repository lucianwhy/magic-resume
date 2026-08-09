# 简历候选数据约定

使用 JSON 保存候选稿。保留源 ID 和事实映射，以便审计和回退。

```json
{
  "meta": {
    "source_resume_id": "source-id",
    "candidate_resume_id": "source-id-role-v2",
    "target_role": "职位名称",
    "jd_source": "绝对路径或用户提供日期"
  },
  "sections": [],
  "changes": [
    {
      "path": "sections.projects[0].bullets[0]",
      "before": "原文",
      "after": "候选文案",
      "fact_ids": ["proj-example-001"],
      "jd_tags": ["LangGraph"]
    }
  ]
}
```

具体 Magic Resume 字段映射以当前云端 CLI `get` 返回的 JSON 为准。不要猜测字段名；先读取数据，再生成 patch。
