#!/usr/bin/env python3
"""Check that requested fact IDs exist in an evidence-ledger Markdown table."""
import argparse
import json
import re
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ledger", required=True, type=Path)
    parser.add_argument("--fact-ids", required=True, help="comma-separated fact IDs")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    text = args.ledger.read_text(encoding="utf-8")
    known = set(re.findall(r"`([^`]+)`", text))
    requested = [item.strip() for item in args.fact_ids.split(",") if item.strip()]
    supported = [item for item in requested if item in known]
    missing = [item for item in requested if item not in known]
    payload = {"supported": supported, "needs_confirmation": missing,
               "eligible": bool(requested) and not missing}
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
