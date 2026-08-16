from datetime import datetime
from functools import wraps
from flask import Blueprint, jsonify, request, session
from . import db
from .models import User, Vocabulary, VocabularyWord, UserVocabulary, UserWordCard, Word

vocabulary_api = Blueprint("vocabulary_api", __name__)

def current_user():
    user_id = session.get("user_id")
    return User.query.filter_by(id=user_id, status="active").first() if user_id else None

def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user: return jsonify({"error": "unauthorized"}), 401
        return fn(user, *args, **kwargs)
    return wrapper

def visible_vocab(user, vocabulary_id):
    return Vocabulary.query.filter_by(id=vocabulary_id).filter((Vocabulary.kind == "system") | (Vocabulary.owner_user_id == user.id)).first()

@vocabulary_api.get("/vocabularies/selections")
@login_required
def selections(user):
    vocabularies = Vocabulary.query.filter((Vocabulary.kind == "system") | (Vocabulary.owner_user_id == user.id)).order_by(Vocabulary.priority.desc(), Vocabulary.created_at.asc()).all()
    selected = {x.vocabulary_id: x for x in UserVocabulary.query.filter_by(user_id=user.id).all()}
    return jsonify([{"vocabularyId": v.id, "name": v.name, "kind": v.kind, "enabled": selected.get(v.id).enabled if v.id in selected else False, "priority": selected.get(v.id).priority if v.id in selected else v.priority} for v in vocabularies])

@vocabulary_api.put("/vocabularies/<vocabulary_id>/selection")
@login_required
def update_selection(user, vocabulary_id):
    vocabulary = visible_vocab(user, vocabulary_id)
    if not vocabulary: return jsonify({"error": "not_found"}), 404
    data = request.get_json(silent=True) or {}
    row = UserVocabulary.query.filter_by(user_id=user.id, vocabulary_id=vocabulary_id).first()
    if not row: row = UserVocabulary(user_id=user.id, vocabulary_id=vocabulary_id); db.session.add(row)
    if "enabled" in data: row.enabled = bool(data["enabled"])
    if "priority" in data: row.priority = max(0, min(int(data["priority"]), 1000))
    row.updated_at = datetime.utcnow(); db.session.commit()
    return jsonify({"vocabularyId": vocabulary_id, "enabled": row.enabled, "priority": row.priority})

@vocabulary_api.put("/vocabularies/selections")
@login_required
def replace_selections(user):
    data = request.get_json(silent=True) or {}; selections_data = data.get("selections", [])
    for item in selections_data:
        vocabulary_id = str(item.get("vocabularyId", "")); vocabulary = visible_vocab(user, vocabulary_id)
        if not vocabulary: continue
        row = UserVocabulary.query.filter_by(user_id=user.id, vocabulary_id=vocabulary_id).first()
        if not row: row = UserVocabulary(user_id=user.id, vocabulary_id=vocabulary_id); db.session.add(row)
        row.enabled = bool(item.get("enabled", False)); row.priority = max(0, min(int(item.get("priority", vocabulary.priority)), 1000)); row.updated_at = datetime.utcnow()
    db.session.commit(); return selections(user)

@vocabulary_api.post("/vocabularies/import")
@login_required
def import_user_vocabulary(user):
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip() or "我的词库"
    words = data.get("words", [])
    if not isinstance(words, list) or len(words) == 0: return jsonify({"error": "words_required"}), 400

    vocabulary = Vocabulary.query.filter_by(owner_user_id=user.id, kind="user", name=name).first()
    created_vocabulary = False
    if not vocabulary:
        vocabulary = Vocabulary(name=name, owner_user_id=user.id, kind="user", priority=50, description="用户导入词库")
        db.session.add(vocabulary); db.session.flush(); created_vocabulary = True
    else:
        vocabulary.description = "用户导入词库"

    inserted = updated = linked = 0; seen = set(); response_words = []
    for item in words:
        if not isinstance(item, dict): continue
        raw = str(item.get("word", "")).strip(); normalized = " ".join(raw.lower().split())
        if not normalized or normalized in seen: continue
        seen.add(normalized)
        word = Word.query.filter_by(normalized_word=normalized).first()
        values = {"word_type": str(item.get("type", item.get("wordType", "")) or "").strip(), "meaning": str(item.get("meaning", "") or "").strip(), "category": str(item.get("category", "") or "").strip(), "source": "user_import", "source_detail": name}
        if word:
            word.word_type = values["word_type"] or word.word_type; word.meaning = values["meaning"] or word.meaning; word.category = values["category"] or word.category; updated += 1
        else:
            word = Word(word=raw, normalized_word=normalized, **values); db.session.add(word); db.session.flush(); inserted += 1
        membership = VocabularyWord.query.filter_by(vocabulary_id=vocabulary.id, word_id=word.id).first()
        if not membership: db.session.add(VocabularyWord(vocabulary_id=vocabulary.id, word_id=word.id, priority=50)); linked += 1
        response_words.append({"id": word.id, "word": word.word, "meaning": word.meaning, "type": word.word_type, "category": word.category})

    if linked == 0:
        db.session.rollback(); return jsonify({"error": "no_new_words", "vocabularyId": vocabulary.id}), 400

    selection = UserVocabulary.query.filter_by(user_id=user.id, vocabulary_id=vocabulary.id).first()
    if not selection:
        db.session.add(UserVocabulary(user_id=user.id, vocabulary_id=vocabulary.id, enabled=True, priority=50))
    else:
        selection.enabled = True; selection.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"id": vocabulary.id, "name": vocabulary.name, "inserted": inserted, "updated": updated, "linked": linked, "created": created_vocabulary, "words": response_words}), 201

@vocabulary_api.get("/study/available")
@login_required
def available_words(user):
    enabled = UserVocabulary.query.filter_by(user_id=user.id, enabled=True).order_by(UserVocabulary.priority.desc()).all()
    vocab_ids = [x.vocabulary_id for x in enabled]
    if not vocab_ids: return jsonify({"vocabularies": [], "wordCount": 0, "newCount": 0, "words": []})
    links = VocabularyWord.query.filter(VocabularyWord.vocabulary_id.in_(vocab_ids)).order_by(VocabularyWord.priority.desc(), VocabularyWord.created_at.asc()).all()
    unique_ids = list(dict.fromkeys(x.word_id for x in links)); words = Word.query.filter(Word.id.in_(unique_ids)).all() if unique_ids else []
    cards = {c.word_id: c for c in UserWordCard.query.filter(UserWordCard.user_id == user.id, UserWordCard.word_id.in_(unique_ids)).all()} if unique_ids else {}
    order = {word_id: i for i, word_id in enumerate(unique_ids)}; words.sort(key=lambda w: order.get(w.id, 10**9))
    return jsonify({"vocabularies": [{"id": x.vocabulary_id, "priority": x.priority} for x in enabled], "wordCount": len(words), "newCount": sum(1 for w in words if w.id not in cards), "words": [{"id": w.id, "word": w.word, "type": w.word_type, "meaning": w.meaning, "category": w.category, "source": w.source, "reviewCount": cards[w.id].review_count if w.id in cards else 0} for w in words]})
