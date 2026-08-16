import re
import unicodedata
from sqlalchemy import func
from .. import db
from ..models import Word


def normalize_word(value: str) -> str:
    value = unicodedata.normalize('NFKC', value or '')
    value = value.strip().lower()
    value = re.sub(r"\s+", " ", value)
    return value


def import_rows(rows, source='import'):
    """Import normalized vocabulary rows without creating duplicate words.

    Accepted keys: word, meaning, example, translation, source.
    Returns inserted/merged/invalid counts and affected words.
    """
    inserted = merged = invalid = 0
    affected = []
    seen = set()
    for row in rows:
        raw = str(row.get('word', '')).strip()
        normalized = normalize_word(raw)
        if not normalized or normalized in seen:
            invalid += 1
            continue
        seen.add(normalized)
        word = Word.query.filter(func.lower(Word.normalized_word) == normalized).first()
        if word:
            merged += 1
            if not word.meaning and row.get('meaning'):
                word.meaning = str(row['meaning']).strip()
            if not word.example and row.get('example'):
                word.example = str(row['example']).strip()
            if not word.translation and row.get('translation'):
                word.translation = str(row['translation']).strip()
        else:
            word = Word(word=raw, normalized_word=normalized,
                        meaning=str(row.get('meaning', '') or '').strip(),
                        example=str(row.get('example', '') or '').strip() or None,
                        translation=str(row.get('translation', '') or '').strip() or None,
                        source=str(row.get('source') or source))
            db.session.add(word)
            inserted += 1
        affected.append(word)
    db.session.commit()
    return {'inserted': inserted, 'merged': merged, 'invalid': invalid,
            'total': len(affected), 'word_ids': [w.id for w in affected]}
