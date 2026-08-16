"""Import an Excel vocabulary workbook into the system vocabulary tables.

Expected columns (order-independent): 单词, 词性, 释义, 分类.
The importer is idempotent by normalized word and vocabulary membership.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import create_app, db  # noqa: E402
from app.models import Vocabulary, VocabularyWord, Word  # noqa: E402

ALIASES = {
    "word": {"单词", "词汇", "word", "english", "英文"},
    "type": {"词性", "词性/短语", "part of speech", "pos"},
    "meaning": {"释义", "中文释义", "意思", "meaning"},
    "category": {"分类", "类别", "category", "类型"},
}
REQUIRED = set(ALIASES)


def clean(value: object) -> str:
    return str(value or "").strip()


def normalize(value: object) -> str:
    return re.sub(r"\s+", " ", clean(value).lower())


def find_header(sheet):
    for row_number, row in enumerate(sheet.iter_rows(min_row=1, max_row=min(sheet.max_row or 1, 30), values_only=True), start=1):
        names = {clean(v).lower() for v in row}
        mapped = {}
        for key, aliases in ALIASES.items():
            for index, name in enumerate(row):
                if clean(name).lower() in {a.lower() for a in aliases}:
                    mapped[key] = index
                    break
        if REQUIRED.issubset(mapped):
            return row_number, mapped
    return None, None


def import_workbook(path: Path, vocabulary_name: str, priority: int, source: str):
    workbook = load_workbook(path, read_only=True, data_only=True)
    app = create_app()
    inserted = updated = linked = skipped = 0
    try:
        with app.app_context():
            vocabulary = Vocabulary.query.filter_by(name=vocabulary_name, kind="system").first()
            if not vocabulary:
                vocabulary = Vocabulary(name=vocabulary_name, kind="system", priority=priority, description=f"Excel导入：{path.name}")
                db.session.add(vocabulary)
                db.session.flush()
            else:
                vocabulary.priority = priority

            for sheet in workbook.worksheets:
                header_row, columns = find_header(sheet)
                if not columns:
                    continue
                for row in sheet.iter_rows(min_row=header_row + 1, values_only=True):
                    word_value = clean(row[columns["word"]] if columns["word"] < len(row) else "")
                    normalized = normalize(word_value)
                    if not normalized:
                        skipped += 1
                        continue
                    values = {
                        "word_type": clean(row[columns["type"]] if columns["type"] < len(row) else ""),
                        "meaning": clean(row[columns["meaning"]] if columns["meaning"] < len(row) else ""),
                        "category": clean(row[columns["category"]] if columns["category"] < len(row) else ""),
                    }
                    word = Word.query.filter_by(normalized_word=normalized).first()
                    if word:
                        word.word_type = values["word_type"]
                        word.meaning = values["meaning"]
                        word.category = values["category"]
                        word.source = source
                        word.source_detail = path.name
                        updated += 1
                    else:
                        word = Word(word=word_value, normalized_word=normalized, source=source, source_detail=path.name, **values)
                        db.session.add(word)
                        db.session.flush()
                        inserted += 1
                    membership = VocabularyWord.query.filter_by(vocabulary_id=vocabulary.id, word_id=word.id).first()
                    if not membership:
                        db.session.add(VocabularyWord(vocabulary_id=vocabulary.id, word_id=word.id, priority=priority))
                        linked += 1
            db.session.commit()
    finally:
        workbook.close()
    return inserted, updated, linked, skipped


def main():
    parser = argparse.ArgumentParser(description="导入考研英语词库 Excel")
    parser.add_argument("file", type=Path)
    parser.add_argument("--name", default="考研英语核心词")
    parser.add_argument("--priority", type=int, default=100)
    parser.add_argument("--source", default="excel")
    args = parser.parse_args()
    if not args.file.exists():
        raise SystemExit(f"文件不存在: {args.file}")
    inserted, updated, linked, skipped = import_workbook(args.file, args.name, args.priority, args.source)
    print(f"导入完成：新增 {inserted}，更新 {updated}，建立词库关系 {linked}，跳过 {skipped}")


if __name__ == "__main__":
    main()
