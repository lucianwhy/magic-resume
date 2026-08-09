#!/usr/bin/env python3
"""Search Bilibili web video metadata with cache and safe degradation."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


SEARCH_ENDPOINT = "https://api.bilibili.com/x/web-interface/search/type"
SEARCH_PAGE = "https://search.bilibili.com/all"
USER_AGENT = "Mozilla/5.0 ican-interview-prep-coach/1.0"
CIRCUIT_SECONDS = 30 * 60

ANGLE_QUERIES = {
    "overview": ["{topic} 科普 原理"],
    "architecture": ["{topic} 架构 工作机制"],
    "practical": ["{topic} 项目 实战"],
    "interview": ["{topic} 面试 项目"],
    "evaluation": ["{topic} 评估 优化"],
    "all": [
        "{topic} 科普 原理",
        "{topic} 架构 工作机制",
        "{topic} 项目 实战",
        "{topic} 面试 评估 优化",
    ],
}

MARKETING_PATTERNS = (
    "通过率98%",
    "少走99%",
    "唯一最全",
    "全网最全",
    "学完就业",
)


class BilibiliError(RuntimeError):
    def __init__(self, message: str, *, risk_control: bool = False) -> None:
        super().__init__(message)
        self.risk_control = risk_control


def clean_text(value: object) -> str:
    text = html.unescape(str(value or ""))
    return re.sub(r"<[^>]+>", "", text).strip()


def as_int(value: object) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def duration_seconds(value: object) -> int:
    parts = str(value or "").split(":")
    try:
        numbers = [int(part) for part in parts]
    except ValueError:
        return 0
    if len(numbers) == 2:
        return numbers[0] * 60 + numbers[1]
    if len(numbers) == 3:
        return numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
    return 0


def bucket_for(seconds: int) -> str:
    if seconds <= 0:
        return "unknown"
    if seconds <= 10 * 60:
        return "quick_intro"
    if seconds <= 30 * 60:
        return "architecture"
    if seconds <= 180 * 60:
        return "hands_on"
    return "full_course"


def cache_file(cache_dir: Path, url: str) -> Path:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return cache_dir / f"{digest}.json"


def read_cache(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def write_circuit(path: Path, reason: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"opened_at": time.time(), "reason": reason}, ensure_ascii=False),
        encoding="utf-8",
    )


def circuit_remaining(path: Path, circuit_seconds: int) -> int:
    state = read_cache(path)
    if not state:
        return 0
    remaining = circuit_seconds - int(time.time() - float(state.get("opened_at", 0)))
    return max(0, remaining)


def fetch_json(
    url: str,
    *,
    cache_dir: Path,
    ttl_seconds: int,
    timeout: float,
    circuit_seconds: int,
) -> tuple[dict, str]:
    path = cache_file(cache_dir, url)
    circuit_path = cache_dir / "risk-control.json"
    cached = read_cache(path)
    now = time.time()
    if cached and now - float(cached.get("cached_at", 0)) <= ttl_seconds:
        return cached["payload"], "fresh-cache"

    remaining = circuit_remaining(circuit_path, circuit_seconds)
    if remaining > 0:
        if cached:
            return cached["payload"], "stale-cache"
        raise BilibiliError(
            f"risk-control circuit open; retry after about {remaining} seconds",
            risk_control=True,
        )

    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Referer": "https://www.bilibili.com/",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
        raw_head = raw[:500].casefold()
        if "<html" in raw_head or "captcha" in raw_head or "错误：412" in raw_head:
            raise BilibiliError("Bilibili returned a verification page", risk_control=True)
        payload = json.loads(raw)
        code = as_int(payload.get("code"))
        if code != 0:
            raise BilibiliError(
                f"Bilibili API code {code}: {payload.get('message', '')}",
                risk_control=code == -412,
            )
        cache_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"cached_at": now, "payload": payload}, ensure_ascii=False),
            encoding="utf-8",
        )
        return payload, "network"
    except BilibiliError as exc:
        if exc.risk_control:
            write_circuit(circuit_path, str(exc))
        if cached:
            return cached["payload"], "stale-cache"
        raise
    except HTTPError as exc:
        risk = exc.code == 412
        if risk:
            write_circuit(circuit_path, f"HTTP {exc.code}")
        if cached:
            return cached["payload"], "stale-cache"
        raise BilibiliError(f"HTTP {exc.code}", risk_control=risk) from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        if cached:
            return cached["payload"], "stale-cache"
        text = str(exc)
        risk = "412" in text or "captcha" in text.lower()
        raise BilibiliError(text, risk_control=risk) from exc


def search_url(query: str) -> str:
    return f"{SEARCH_PAGE}?keyword={quote(query)}"


def build_api_url(query: str, page: int) -> str:
    params = {
        "search_type": "video",
        "keyword": query,
        "page": page,
        "order": "totalrank",
        "duration": 0,
    }
    return f"{SEARCH_ENDPOINT}?{urlencode(params)}"


def topic_matches(topic: str, item: dict) -> bool:
    haystack = " ".join(
        clean_text(item.get(field)) for field in ("title", "description", "tag")
    ).casefold()
    return topic.casefold().strip() in haystack


def normalize_item(item: dict, query: str, rank: int, source: str) -> dict:
    seconds = duration_seconds(item.get("duration"))
    title = clean_text(item.get("title"))
    warnings = [pattern for pattern in MARKETING_PATTERNS if pattern in title]
    published = None
    timestamp = as_int(item.get("pubdate"))
    if timestamp > 0:
        published = datetime.fromtimestamp(timestamp, tz=timezone.utc).date().isoformat()
    return {
        "bvid": str(item.get("bvid") or ""),
        "title": title,
        "author": clean_text(item.get("author")),
        "duration": str(item.get("duration") or ""),
        "duration_seconds": seconds,
        "duration_bucket": bucket_for(seconds),
        "published": published,
        "views": as_int(item.get("play")),
        "favorites": as_int(item.get("favorites")),
        "description": clean_text(item.get("description")),
        "url": f"https://www.bilibili.com/video/{item.get('bvid')}",
        "best_search_rank": rank,
        "source_queries": [query],
        "metadata_source": source,
        "warnings": warnings,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--topic", required=True, help="Unambiguous topic, for example RAG")
    parser.add_argument("--angle", choices=sorted(ANGLE_QUERIES), default="all")
    parser.add_argument("--query", action="append", help="Override generated query; repeatable")
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--max-queries", type=int, default=4)
    parser.add_argument("--per-query", type=int, default=10)
    parser.add_argument("--per-slot", type=int, default=5)
    parser.add_argument("--delay", type=float, default=2.0)
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--cache-ttl", type=int, default=21600)
    parser.add_argument("--circuit-seconds", type=int, default=CIRCUIT_SECONDS)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    if not 1 <= args.page <= 50:
        parser.error("--page must be between 1 and 50")
    if not 1 <= args.max_queries <= 4:
        parser.error("--max-queries must be between 1 and 4")
    if not 1 <= args.per_query <= 20:
        parser.error("--per-query must be between 1 and 20")
    if not 1 <= args.per_slot <= 10:
        parser.error("--per-slot must be between 1 and 10")
    if not 60 <= args.circuit_seconds <= 86400:
        parser.error("--circuit-seconds must be between 60 and 86400")

    queries = args.query or [template.format(topic=args.topic) for template in ANGLE_QUERIES[args.angle]]
    queries = list(dict.fromkeys(query.strip() for query in queries if query.strip()))[: args.max_queries]
    cache_dir = args.cache_dir or Path(tempfile.gettempdir()) / "ican-interview-prep-coach-bilibili"

    videos: dict[str, dict] = {}
    errors: list[dict] = []
    fallbacks = [search_url(query) for query in queries]
    for index, query in enumerate(queries):
        try:
            payload, source = fetch_json(
                build_api_url(query, args.page),
                cache_dir=cache_dir,
                ttl_seconds=args.cache_ttl,
                timeout=args.timeout,
                circuit_seconds=args.circuit_seconds,
            )
            items = ((payload.get("data") or {}).get("result") or [])[: args.per_query]
            for rank, item in enumerate(items, start=1):
                bvid = str(item.get("bvid") or "")
                if not bvid or not topic_matches(args.topic, item):
                    continue
                if bvid in videos:
                    videos[bvid]["source_queries"].append(query)
                    videos[bvid]["best_search_rank"] = min(videos[bvid]["best_search_rank"], rank)
                else:
                    videos[bvid] = normalize_item(item, query, rank, source)
        except BilibiliError as exc:
            errors.append({"query": query, "error": str(exc), "risk_control": exc.risk_control})
            if exc.risk_control:
                break
        if index < len(queries) - 1:
            time.sleep(max(0.8, min(args.delay, 5.0)))

    grouped: dict[str, list[dict]] = {
        "quick_intro": [],
        "architecture": [],
        "hands_on": [],
        "interview": [],
        "evaluation": [],
        "full_course": [],
        "unknown": [],
    }
    for video in videos.values():
        title_text = f"{video['title']} {video['description']}".casefold()
        if "面试" in title_text:
            slot = "interview"
        elif any(word in title_text for word in ("评估", "优化", "ragas", "召回", "重排")):
            slot = "evaluation"
        else:
            slot = video["duration_bucket"]
        grouped[slot].append(video)

    for slot in grouped:
        grouped[slot] = sorted(
            grouped[slot],
            key=lambda item: (item["best_search_rank"], -item["favorites"], -item["views"]),
        )[: args.per_slot]

    result = {
        "status": "ok" if not errors else ("partial" if videos else "degraded"),
        "topic": args.topic,
        "angle": args.angle,
        "queried_at": datetime.now(timezone.utc).isoformat(),
        "queries": queries,
        "request_budget": len(queries),
        "slots": grouped,
        "errors": errors,
        "fallback_search_urls": fallbacks,
        "notice": "Bilibili web search metadata is experimental; metadata does not prove content accuracy.",
    }
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")


if __name__ == "__main__":
    main()
