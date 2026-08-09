#!/usr/bin/env python3
"""Print deterministic training checklist for one interview-prep stage."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


STAGES = {
    "technical": {
        "reference_dir": "references/technical",
        "goal": "解释概念、架构、取舍与排障，并映射到真实项目。",
        "deliverables": ["能力地图", "概念卡", "项目映射", "一个 5 分钟练习"],
        "defaults": ["RAG", "Agent 与工作流", "Function Call/MCP", "FastAPI 与数据库"],
    },
    "project": {
        "reference_dir": "references/project",
        "goal": "把项目写成可验证的工程故事，并形成优化建议。",
        "deliverables": ["项目证据卡", "90 秒叙事", "优化建议", "待补事实"],
        "defaults": ["职责边界", "架构与数据流", "关键取舍", "结果口径"],
    },
    "pressure": {
        "reference_dir": "references/pressure",
        "goal": "审计高风险主张，准备诚实且有边界的回应。",
        "deliverables": ["主张审计表", "追问树", "30 秒边界回答", "补证优先级"],
        "defaults": ["项目真实性", "指标口径", "技术深度", "经验与 JD 差距"],
    },
    "hr-business": {
        "reference_dir": "references/hr-business",
        "goal": "将项目能力翻译成业务价值与合作预期。",
        "deliverables": ["自我介绍", "三个为什么", "协作故事", "条件沟通清单"],
        "defaults": ["岗位动机", "公司研究", "协作与挫折", "城市与入职"],
    },
}

CAPABILITY_LEVELS = {
    "L0": "未知：未接触，或无法辨认概念。",
    "L1": "识别：能给出基本定义和用途。",
    "L2": "解释：能讲清最小架构、流程和组件。",
    "L3": "应用：能映射到真实项目并说明本人动作。",
    "L4": "取舍：能解释选择、失败模式、排障和边界。",
    "L5": "优化：能提出可验证的优化及评估指标。",
}

TRAINING_DESIGN = {
    "reference": "references/common/training-design.md",
    "diagnosis": {
        "current_level": None,
        "target_level": None,
        "gap_dimensions": ["knowledge", "application", "expression", "evidence"],
        "priority_rule": "岗位重要度 × 缺口大小 × 面试紧迫度",
    },
    "micro_lesson": [
        "为什么会考",
        "一句话定义",
        "最小架构",
        "项目映射",
        "常见误区",
        "表达边界",
        "五分钟练习",
        "通过标准",
    ],
    "evaluation": {
        "dimensions": ["理解", "表达", "映射", "取舍"],
        "states": ["通过", "部分通过", "待训练", "缺证据"],
    },
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=sorted(STAGES), required=True)
    parser.add_argument("--output", type=Path, help="Optional JSON output path")
    args = parser.parse_args()

    plan = {
        "stage": args.stage,
        "capability_levels": CAPABILITY_LEVELS,
        "training_design": TRAINING_DESIGN,
        **STAGES[args.stage],
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(plan, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
