#!/usr/bin/env python3
"""Report structural JSON differences; never modify either input."""
import argparse
import json
from pathlib import Path


def walk(before, after, path=""):
    if isinstance(before, dict) and isinstance(after, dict):
        for key in sorted(set(before) | set(after)):
            child = f"{path}.{key}" if path else key
            yield from walk(before.get(key), after.get(key), child)
    elif isinstance(before, list) and isinstance(after, list):
        for index in range(max(len(before), len(after))):
            child = f"{path}[{index}]"
            yield from walk(before[index] if index < len(before) else None,
                            after[index] if index < len(after) else None, child)
    elif before != after:
        yield {"path": path, "before": before, "after": after}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--candidate", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    base = json.loads(args.base.read_text(encoding="utf-8"))
    candidate = json.loads(args.candidate.read_text(encoding="utf-8"))
    changes = list(walk(base, candidate))
    payload = {"base": str(args.base.resolve()), "candidate": str(args.candidate.resolve()),
               "change_count": len(changes), "changes": changes}
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
