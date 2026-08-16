from flask import Blueprint, request, jsonify
from ..auth import require_user
from ..models import Word
from ..services.importer import import_xlsx

bp = Blueprint('vocabulary', __name__)


@bp.get('/')
@require_user
def list_words(user):
    q = str(request.args.get('q', '')).strip()
    query = Word.query
    if q:
        query = query.filter(Word.word.ilike(f'%{q}%'))
    words = query.order_by(Word.word.asc()).limit(100).all()
    return jsonify({'items': [{'id': w.id, 'word': w.word, 'meaning': w.meaning, 'example': w.example, 'translation': w.translation} for w in words]})


@bp.post('/import')
@require_user
def import_words(user):
    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'missing file'}), 400
    try:
        return jsonify(import_xlsx(file.stream))
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
