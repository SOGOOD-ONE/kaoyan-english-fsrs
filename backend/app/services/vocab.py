import re
import unicodedata
from sqlalchemy import func
from .. import db
from ..models import Word, Vocabulary, VocabularyWord, WordExample


def normalize_word(value: str) -> str:
    value = unicodedata.normalize('NFKC', value or '')
    value = value.strip().lower()
    value = re.sub(r'\s+', ' ', value)
    return value


def import_rows(user_id, rows, vocabulary_name='我的词库', source='import'):
    vocabulary = Vocabulary.query.filter_by(owner_user_id=user_id, name=vocabulary_name, kind='user').first()
    if not vocabulary:
        vocabulary = Vocabulary(owner_user_id=user_id, name=vocabulary_name, kind='user')
        db.session.add(vocabulary)
        db.session.flush()

    inserted = merged = duplicate = invalid = 0
    affected = []
    seen = set()
    for row in rows:
        if not isinstance(row, dict):
            invalid += 1
            continue
        raw = str(row.get('word', '')).strip()
        normalized = normalize_word(raw)
        if not normalized:
            invalid += 1
            continue
        if normalized in seen:
            duplicate += 1
            continue
        seen.add(normalized)
        word = Word.query.filter_by(normalized_word=normalized).first()
        if word:
            merged += 1
        else:
            word = Word(word=raw, normalized_word=normalized,
                        meaning=str(row.get('meaning', '') or '').strip(),
                        source=str(row.get('source') or source))
            db.session.add(word)
            db.session.flush()
            inserted += 1

        link = VocabularyWord.query.filter_by(vocabulary_id=vocabulary.id, word_id=word.id).first()
        if link:
            duplicate += 1
        else:
            db.session.add(VocabularyWord(vocabulary_id=vocabulary.id, word_id=word.id))

        sentence = str(row.get('example', '') or '').strip()
        translation = str(row.get('translation', '') or '').strip() or None
        if sentence:
            exists = WordExample.query.filter_by(word_id=word.id, sentence=sentence).first()
            if not exists:
                db.session.add(WordExample(word_id=word.id, sentence=sentence, translation=translation,
                                            year=row.get('year'), paper=row.get('paper'),
                                            paragraph=row.get('paragraph'), source=source))
        affected.append(word)

    db.session.commit()
    return {
        'vocabulary_id': vocabulary.id,
        'vocabulary_name': vocabulary.name,
        'inserted': inserted,
        'merged': merged,
        'duplicate': duplicate,
        'invalid': invalid,
        'total': len(affected),
        'word_ids': [w.id for w in affected],
    }
