#!/usr/bin/env python3
"""Validate an ICAN career workspace and return machine-readable results."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REQUIRED_FILES = [
    ".ican/project.json",
    ".ican/state.json",
    ".ican/AI_CONTEXT.md",
    "AGENTS.md",
    "CLAUDE.md",
    "START-HERE.md",
    "knowledge/overview.md",
    "knowledge/open-loops.md",
    ".gitignore",
]
REQUIRED_DIRS = [
    "knowledge/records",
    "knowledge/sources",
    "jobs",
    "resumes",
    "interviews",
    "exports",
    "private",
]


def find_root(start: Path) -> Path | None:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".ican/project.json").exists():
            return candidate
    return None


def validate(root: Path) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    for relative in REQUIRED_FILES:
        if not (root / relative).is_file():
            errors.append(f"Missing file: {relative}")
    for relative in REQUIRED_DIRS:
        if not (root / relative).is_dir():
            errors.append(f"Missing directory: {relative}")

    for relative in [".ican/project.json", ".ican/state.json"]:
        path = root / relative
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            errors.append(f"Invalid JSON: {relative}: {exc}")
            continue
        if data.get("schema_version") != 1:
            warnings.append(f"Unsupported or missing schema_version: {relative}")

    for relative in ["AGENTS.md", "CLAUDE.md"]:
        path = root / relative
        if path.exists() and ".ican/AI_CONTEXT.md" not in path.read_text(encoding="utf-8"):
            errors.append(f"Missing AI context pointer: {relative}")

    gitignore = root / ".gitignore"
    if gitignore.exists() and "/private/" not in gitignore.read_text(encoding="utf-8"):
        warnings.append("private/ is not protected by .gitignore")

    return {
        "workspace": str(root),
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", help="Workspace path or a child path.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    start = Path(args.root).expanduser() if args.root else Path.cwd()
    root = find_root(start)
    if root is None:
        result = {
            "workspace": str(start.resolve()),
            "valid": False,
            "errors": ["No .ican/project.json found in this directory or its parents."],
            "warnings": [],
        }
    else:
        result = validate(root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)
