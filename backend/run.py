import os

from app import create_app


def bootstrap_vocabularies() -> None:
    """Import every bundled system workbook that is present.

    The importer itself is idempotent, so this also picks up a new workbook
    (for example 作文公共词库.xlsx) added after the core vocabulary existed.
    Set FORCE_VOCAB_IMPORT=1 to refresh existing rows from updated workbooks.
    """
    if os.getenv("DISABLE_VOCAB_BOOTSTRAP") == "1":
        return

    from scripts.bootstrap_vocabulary import bootstrap
    for result in bootstrap():
        print(f"[vocabulary-bootstrap] {result}")


app = create_app()

try:
    bootstrap_vocabularies()
except Exception as exc:
    # Keep the API available even if an optional workbook is malformed.
    print(f"[vocabulary-bootstrap] skipped: {exc}")

if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "0") == "1"
app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=debug_mode)
