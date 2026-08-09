#!/usr/bin/env python3
"""Create or repair an ICAN career workspace without overwriting user data."""

from __future__ import annotations

import argparse
import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
MANAGED_START = "<!-- ICAN:START -->"
MANAGED_END = "<!-- ICAN:END -->"
SKILL_ROOT = Path(__file__).resolve().parent.parent
ASSETS = SKILL_ROOT / "assets"


def now_local() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def default_root() -> Path:
    current = Path.cwd().resolve()
    home = Path.home().resolve()
    if current == home or current.parent == current:
        return current / "ican-career-workspace"
    return current


def load_template(name: str) -> str:
    return (ASSETS / name).read_text(encoding="utf-8").rstrip() + "\n"


def write_if_missing(path: Path, content: str, report: dict[str, list[str]]) -> None:
    if path.exists():
        report["preserved"].append(str(path))
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    report["created"].append(str(path))


def upsert_managed_block(
    path: Path, body: str, report: dict[str, list[str]], heading: str = ""
) -> None:
    block = f"{MANAGED_START}\n{body.rstrip()}\n{MANAGED_END}\n"
    if not path.exists():
        prefix = f"{heading.rstrip()}\n\n" if heading else ""
        path.write_text(prefix + block, encoding="utf-8")
        report["created"].append(str(path))
        return
    current = path.read_text(encoding="utf-8")
    if MANAGED_START in current and MANAGED_END in current:
        report["preserved"].append(str(path))
        return
    separator = "" if current.endswith("\n\n") else "\n" if current.endswith("\n") else "\n\n"
    path.write_text(current + separator + block, encoding="utf-8")
    report["updated"].append(str(path))


def write_json_if_missing(
    path: Path, value: dict[str, Any], report: dict[str, list[str]]
) -> dict[str, Any]:
    if path.exists():
        report["preserved"].append(str(path))
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            report["warnings"].append(f"Invalid JSON preserved for manual repair: {path}")
            return {}
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report["created"].append(str(path))
    return value


def initialize(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).expanduser().resolve() if args.root else default_root()
    root.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "workspace": str(root),
        "created": [],
        "updated": [],
        "preserved": [],
        "warnings": [],
    }

    directories = [
        ".ican",
        "knowledge/records",
        "knowledge/sources",
        "jobs",
        "resumes",
        "interviews",
        "exports",
        "private",
    ]
    for relative in directories:
        path = root / relative
        if path.exists():
            report["preserved"].append(str(path))
        else:
            path.mkdir(parents=True, exist_ok=True)
            report["created"].append(str(path))

    project = {
        "schema_version": SCHEMA_VERSION,
        "project_type": "ican-career-workspace",
        "project_id": str(uuid.uuid4()),
        "created_at": now_local(),
        "language": "zh-CN",
    }
    state = {
        "schema_version": SCHEMA_VERSION,
        "onboarding": {"status": "ready_for_intake", "mode": args.mode},
        "resume": {"status": args.resume_status},
        "career_target": {
            "status": "provided" if args.target_role else "missing",
            "role": args.target_role,
        },
        "readiness": {
            "knowledge_base": False,
            "resume_tailoring": False,
            "interview_prep": False,
        },
        "updated_at": now_local(),
    }
    write_json_if_missing(root / ".ican/project.json", project, report)
    state_path = root / ".ican/state.json"
    state_existed = state_path.exists()
    stored_state = write_json_if_missing(state_path, state, report)
    if state_existed and stored_state:
        changed = False
        if args.mode != "unknown":
            onboarding = stored_state.setdefault("onboarding", {})
            if onboarding.get("mode") != args.mode:
                onboarding["mode"] = args.mode
                changed = True
        if args.resume_status == "provided":
            resume = stored_state.setdefault("resume", {})
            if resume.get("status") != "provided":
                resume["status"] = "provided"
                changed = True
        if args.target_role:
            target = stored_state.setdefault("career_target", {})
            if target.get("role") != args.target_role or target.get("status") != "provided":
                target.update({"status": "provided", "role": args.target_role})
                changed = True
        if changed:
            stored_state["updated_at"] = now_local()
            state_path.write_text(
                json.dumps(stored_state, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            state_string = str(state_path)
            if state_string in report["preserved"]:
                report["preserved"].remove(state_string)
            report["updated"].append(state_string)

    write_if_missing(
        root / ".ican/AI_CONTEXT.md", load_template("AI_CONTEXT.template.md"), report
    )
    write_if_missing(root / "START-HERE.md", load_template("START-HERE.template.md"), report)
    write_if_missing(
        root / "knowledge/overview.md", load_template("overview.template.md"), report
    )
    write_if_missing(
        root / "knowledge/open-loops.md", load_template("open-loops.template.md"), report
    )

    upsert_managed_block(
        root / "AGENTS.md", load_template("AGENTS.template.md"), report, "# 项目指令"
    )
    upsert_managed_block(
        root / "CLAUDE.md", load_template("CLAUDE.template.md"), report, "# 项目指令"
    )
    gitignore = "# ICAN private data\n/private/\n/.ican/local.json\n/resumes/private/"
    upsert_managed_block(root / ".gitignore", gitignore, report)

    report["next_action"] = (
        "import_existing_materials"
        if args.mode == "import" or args.resume_status == "provided"
        else "ask_import_or_start_new"
    )
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", help="Workspace path. Defaults to current directory.")
    parser.add_argument("--mode", choices=["unknown", "new", "import"], default="unknown")
    parser.add_argument(
        "--resume-status", choices=["missing", "provided"], default="missing"
    )
    parser.add_argument("--target-role", default=None)
    return parser.parse_args()


if __name__ == "__main__":
    result = initialize(parse_args())
    print(json.dumps(result, ensure_ascii=False, indent=2))
