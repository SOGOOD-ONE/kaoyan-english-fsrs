"""Bootstrap bundled Excel vocabularies on deployment/startup.

The operation is intentionally idempotent: the importer matches words by
normalized_word and vocabulary memberships by (vocabulary_id, word_id).
"""
from __future__ import annotations

import json
from pathlib import Path

from import_vocabulary import import_workbook

ROOT = Path(__file__).resolve().parents[2]
VOCAB_ROOT = ROOT / "data" / "vocabulary"

WORKBOOKS = [
    {
        "filename": "考研英语核心词_单词表_2026-08-16.xlsx",
        "name": "考研英语核心词",
        "priority": 100,
        "source": "bundled_excel",
    },
    {
        "filename": "作文公共词库.xlsx",
        "name": "作文公共词库",
        "priority": 90,
        "source": "bundled_excel",
    },
]


def bootstrap() -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    for item in WORKBOOKS:
        path = VOCAB_ROOT / item["filename"]
        if not path.exists():
            results.append({"file": item["filename"], "status": "missing"})
            continue
        inserted, updated, linked, skipped = import_workbook(
            path,
            str(item["name"]),
            int(item["priority"]),
            str(item["source"]),
        )
        results.append({
            "file": item["filename"],
            "status": "ok",
            "inserted": inserted,
            "updated": updated,
            "linked": linked,
            "skipped": skipped,
        })
    return results


if __name__ == "__main__":
    print(json.dumps(bootstrap(), ensure_ascii=False, indent=2))
