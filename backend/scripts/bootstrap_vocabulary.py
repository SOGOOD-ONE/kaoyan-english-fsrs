"""Bootstrap bundled Excel vocabularies on deployment/startup.

The operation is idempotent. Workbooks may live under data/vocabulary/ or at
repository root, which matches the current uploaded workbook location.
"""
from __future__ import annotations

import json
from pathlib import Path

try:
    from scripts.import_vocabulary import import_workbook
except ImportError:  # pragma: no cover - fallback for direct script execution
    from import_vocabulary import import_workbook

ROOT = Path(__file__).resolve().parents[2]

WORKBOOKS = [
    {"filename": "考研英语核心词_单词表_2026-08-16.xlsx", "name": "考研英语核心词", "priority": 100, "source": "bundled_excel"},
    {"filename": "考研英语大纲5500词词汇表完美打印乱序版.xlsx", "name": "考研英语大纲5500词", "priority": 99, "source": "bundled_excel"},
    {"filename": "作文公共词库.xlsx", "name": "作文公共词库", "priority": 90, "source": "bundled_excel"},
    {"filename": "考研英语二真题词库.xlsx", "name": "考研英语二真题词", "priority": 95, "source": "bundled_excel"},
    {"filename": "长难词库.xlsx", "name": "考研英语长难词", "priority": 92, "source": "bundled_excel"},
]


def locate(filename: str) -> Path | None:
    for path in (ROOT / "data" / "vocabulary" / filename, ROOT / filename):
        if path.exists():
            return path
    return None


def bootstrap() -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    for item in WORKBOOKS:
        path = locate(str(item["filename"]))
        if path is None:
            results.append({"file": item["filename"], "status": "missing"})
            continue
        inserted, updated, linked, skipped = import_workbook(path, str(item["name"]), int(item["priority"]), str(item["source"]))
        results.append({"file": item["filename"], "status": "ok", "path": str(path.relative_to(ROOT)), "inserted": inserted, "updated": updated, "linked": linked, "skipped": skipped})
    return results


if __name__ == "__main__":
    print(json.dumps(bootstrap(), ensure_ascii=False, indent=2))
