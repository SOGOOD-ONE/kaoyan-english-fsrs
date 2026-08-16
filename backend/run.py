import os
from pathlib import Path

from app import create_app


def bootstrap_vocabularies() -> None:
    """Import bundled workbooks only when the core system vocabulary is absent.

    Supports the workbook being stored either in data/vocabulary/ or at the
    repository root (the current upload location). Set FORCE_VOCAB_IMPORT=1
    to re-run the idempotent importer after updating a workbook.
    """
    if os.getenv("DISABLE_VOCAB_BOOTSTRAP") == "1":
        return

    from app.models import Vocabulary
    from app import db

    with app.app_context():
        core = Vocabulary.query.filter_by(name="考研英语核心词", kind="system").first()
        force = os.getenv("FORCE_VOCAB_IMPORT") == "1"
        if core and not force:
            return

    from scripts.bootstrap_vocabulary import bootstrap

    results = bootstrap()
    for result in results:
        print(f"[vocabulary-bootstrap] {result}")


app = create_app()

try:
    bootstrap_vocabularies()
except Exception as exc:  # Keep the API available even if an optional workbook is malformed.
    print(f"[vocabulary-bootstrap] skipped: {exc}")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
