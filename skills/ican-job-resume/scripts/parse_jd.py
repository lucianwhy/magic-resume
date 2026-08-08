#!/usr/bin/env python3
"""Create a transparent, conservative JD analysis from UTF-8 text."""
import argparse
import json
import re
from pathlib import Path

HEADERS = {
    "must_have": ("任职要求", "职位要求", "岗位要求", "我们希望你", "要求"),
    "preferred": ("加分项", "优先", "优先考虑", "我们更希望"),
    "responsibilities": ("岗位职责", "工作职责", "你将负责", "工作内容", "职责"),
}
KEYWORDS = (
    "Python", "FastAPI", "LangChain", "LangGraph", "RAG", "Agent", "MCP",
    "Docker", "Kubernetes", "MySQL", "Redis", "LLM", "React", "TypeScript",
)


def bullets(text: str) -> list[str]:
    return [re.sub(r"^[\s\-•·\d.、]+", "", line).strip()
            for line in text.splitlines()
            if re.sub(r"^[\s\-•·\d.、]+", "", line).strip()]


def classify(lines: list[str]) -> dict[str, list[str]]:
    out = {"must_have": [], "preferred": [], "responsibilities": []}
    target = None
    for line in lines:
        found = next((key for key, values in HEADERS.items() if any(v in line for v in values)), None)
        if found:
            target = found
            tail = re.sub("|".join(map(re.escape, HEADERS[found])), "", line).strip("：: -")
            if tail:
                out[target].append(tail)
        elif target:
            out[target].append(line)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    raw = args.input.read_text(encoding="utf-8")
    lines = bullets(raw)
    groups = classify(lines)
    found_keywords = [key for key in KEYWORDS if re.search(rf"\b{re.escape(key)}\b", raw, re.I)]
    role = lines[0] if lines else ""
    payload = {
        "source": str(args.input.resolve()), "role": role,
        **groups, "constraints": [], "keywords": found_keywords,
        "notes": ["自动初稿；请人工确认分类，关键词出现不等于硬性要求。"],
    }
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
