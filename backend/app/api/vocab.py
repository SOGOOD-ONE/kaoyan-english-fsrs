from flask import Blueprint, jsonify, request
from ..auth import require_user
from ..services.vocab import import_rows, normalize_word
from ..models import Word

bp = Blueprint('vocab', __name__)

@bp.get('/search')
@require_user
def search(user):
    q = normalize_word(request.args.get('q', ''))
    if not q:
        return jsonify({'items': []})
    rows = Word.query.filter(Word.normalized_word.like(f'%{q}%')).order_by(Word.normalized_word.asc()).limit(50).all()
    return jsonify({'items': [{'id': w.id, 'word': w.word, 'meaning': w.meaning, 'example': w.example, 'translation': w.translation, 'source': w.source} for w in rows]})

@bp.post('/import')
@require_user
def import_vocab(user):
    data = request.get_json(silent=True) or {}
    rows = data.get('rows')
    if not isinstance(rows, list):
        return jsonify({'error': 'rows must be an array'}), 400
    if len(rows) > 10000:
        return jsonify({'error': 'too many rows'}), 400
    clean = [r for r in rows if isinstance(r, dict)]
    result = import_rows(clean, source=f'user:{user.id}')
    return jsonify(result)
