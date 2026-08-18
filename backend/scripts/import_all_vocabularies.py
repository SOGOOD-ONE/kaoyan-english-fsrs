"""Import all supported vocabulary workbooks from the repository data directory."""
from pathlib import Path

try:
    from scripts.import_vocabulary import import_workbook
except ImportError:  # pragma: no cover - fallback for direct script execution
    from import_vocabulary import import_workbook

ROOT = Path(__file__).resolve().parents[2]
VOCAB_DIR = ROOT / "data" / "vocabulary"

SOURCES = [
    ("考研英语核心词_单词表_2026-08-16.xlsx", "考研英语核心词", 100),
    ("作文公共词库.xlsx", "作文公共词", 90),
    ("考研英语二真题词库.xlsx", "考研英语二真题词", 95),
    ("长难词库.xlsx", "考研英语长难词", 92),
]


def main():
    total = [0, 0, 0, 0]
    for filename, name, priority in SOURCES:
        path = VOCAB_DIR / filename
        if not path.exists():
            print(f"跳过：{filename}（尚未上传）")
            continue
        result = import_workbook(path, name, priority, "repository-excel")
        total = [a + b for a, b in zip(total, result)]
        print(f"{name}: 新增 {result[0]}，更新 {result[1]}，关系 {result[2]}，跳过 {result[3]}")
    print(f"合计：新增 {total[0]}，更新 {total[1]}，关系 {total[2]}，跳过 {total[3]}")


if __name__ == "__main__":
    main()
