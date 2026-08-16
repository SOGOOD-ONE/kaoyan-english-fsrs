from flask import Blueprint, jsonify, request
from ..auth import require_user
from ..services.vocab import import_rows, normalize_word
from ..models import Word, WordExample

bp = Blueprint('vocab', __name__)


def serialize_word(w):
    examples = WordExample.query.filter_by(word_id=w.id).order_by(WordExample.year.desc().nullslast()).limit(20).all()
    return {
        'id': w.id,
        'word': w.word,
        'meaning': w.meaning,
        'source': w.source,
        'examples': [{'sentence': e.sentence, 'translation': e.translation, 'year': e.year,
                      'paper': e.paper, 'paragraph': e.paragraph, 'source': e.source} for e in examples]
    }


@bp.get('/search')
@require_user
def search(user):
    q = normalize_word(request.args.get('q', ''))
    if not q:
        return jsonify({'items': []})
    rows = Word.query.filter(Word.normalized_word.like(f'%{q}%')).order_by(Word.normalized_word.asc()).limit(50).all()
    return jsonify({'items': [serialize_word(w) for w in rows]})


@bp.post('/import')
@require_user
def import_vocab(user):
    data = request.get_json(silent=True) or {}
    rows = data.get('rows')
    if not isinstance(rows, list):
        return jsonify({'error': 'rows must be an array'}), 400
    if len(rows) > 10000:
        return jsonify({'error': 'too many rows'}), 400
    name = str(data.get('vocabulary_name') or '我的词库').strip()[:120] or '我的词库'
    clean = [r for r in rows if isinstance(r, dict)]
    result = import_rows(user.id, clean, vocabulary_name=name, source=f'user:{user.id}')
    return jsonify(result)
