from datetime import datetime
from functools import wraps

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from . import db
from .models import DailyPlan, ReviewLog, User, UserSetting, UserWordCard, Vocabulary, VocabularyWord, Word

api = Blueprint("api", __name__)


def current_user():
    user_id = session.get("user_id")
    return User.query.filter_by(id=user_id, status="active").first() if user_id else None


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        return fn(user, *args, **kwargs)
    return wrapper


def user_json(user):
    return {
        "id": user.id,
        "email": user.email,
        "nickname": user.nickname,
        "status": user.status,
        "createdAt": user.created_at.isoformat(),
        "lastLoginAt": user.last_login_at.isoformat() if user.last_login_at else None,
    }


@api.get("/health")
def health():
    return jsonify({"ok": True})


@api.post("/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    nickname = str(data.get("nickname", "考研用户")).strip() or "考研用户"

    if len(email) < 5 or "@" not in email:
        return jsonify({"error": "invalid_email"}), 400
    if len(password) < 8:
        return jsonify({"error": "password_too_short"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "email_exists"}), 409

    user = User(email=email, password_hash=generate_password_hash(password), nickname=nickname)
    db.session.add(user)
    db.session.flush()
    db.session.add(UserSetting(user_id=user.id))
    db.session.commit()
    session.clear()
    session["user_id"] = user.id
    return jsonify({"user": user_json(user)}), 201


@api.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password) or user.status != "active":
        return jsonify({"error": "invalid_credentials"}), 401

    user.last_login_at = datetime.utcnow()
    db.session.commit()
    session.clear()
    session["user_id"] = user.id
    return jsonify({"user": user_json(user)})


@api.post("/auth/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@api.get("/auth/me")
def me():
    user = current_user()
    return jsonify({"user": user_json(user) if user else None})


@api.get("/settings")
@login_required
def get_settings(user):
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    if not settings:
        settings = UserSetting(user_id=user.id)
        db.session.add(settings)
        db.session.commit()
    return jsonify({
        "dailyNewQuota": settings.daily_new_quota,
        "timezone": settings.timezone,
        "soundEnabled": settings.sound_enabled,
        "autoPlayExample": settings.auto_play_example,
    })


@api.put("/settings")
@login_required
def update_settings(user):
    data = request.get_json(silent=True) or {}
    settings = UserSetting.query.filter_by(user_id=user.id).first() or UserSetting(user_id=user.id)
    if "dailyNewQuota" in data:
        settings.daily_new_quota = max(0, min(int(data["dailyNewQuota"]), 1000))
    if "timezone" in data:
        settings.timezone = str(data["timezone"])
    if "soundEnabled" in data:
        settings.sound_enabled = bool(data["soundEnabled"])
    if "autoPlayExample" in data:
        settings.auto_play_example = bool(data["autoPlayExample"])
    db.session.add(settings)
    db.session.commit()
    return get_settings(user)


@api.get("/cards")
@login_required
def cards(user):
    rows = UserWordCard.query.filter_by(user_id=user.id).all()
    return jsonify([{
        "id": row.id,
        "wordId": row.word_id,
        "state": row.state,
        "stability": row.stability,
        "difficulty": row.difficulty,
        "dueAt": row.due_at.isoformat(),
        "firstLearnedAt": row.first_learned_at.isoformat() if row.first_learned_at else None,
        "lastReviewAt": row.last_review_at.isoformat() if row.last_review_at else None,
        "correctCount": row.correct_count,
        "wrongCount": row.wrong_count,
        "reviewCount": row.review_count,
    } for row in rows])


@api.put("/cards/<word_id>")
@login_required
def upsert_card(user, word_id):
    data = request.get_json(silent=True) or {}
    card = UserWordCard.query.filter_by(user_id=user.id, word_id=word_id).first()
    if not card:
        if not Word.query.filter_by(id=word_id).first():
            return jsonify({"error": "word_not_found"}), 404
        card = UserWordCard(user_id=user.id, word_id=word_id)
        db.session.add(card)

    for key, attr in {
        "state": "state", "stability": "stability", "difficulty": "difficulty",
        "correctCount": "correct_count", "wrongCount": "wrong_count", "reviewCount": "review_count",
    }.items():
        if key in data:
            setattr(card, attr, data[key])
    if "dueAt" in data:
        card.due_at = datetime.fromisoformat(data["dueAt"].replace("Z", "+00:00")).replace(tzinfo=None)
    db.session.commit()
    return jsonify({"id": card.id, "wordId": card.word_id})


@api.post("/reviews")
@login_required
def create_review(user):
    data = request.get_json(silent=True) or {}
    word_id = str(data.get("wordId", ""))
    card = UserWordCard.query.filter_by(user_id=user.id, word_id=word_id).first()
    if not card:
        return jsonify({"error": "card_not_found"}), 404
    rating = int(data.get("rating", 0))
    if rating < 1 or rating > 4:
        return jsonify({"error": "invalid_rating"}), 400

    reviewed_at = datetime.utcnow()
    log = ReviewLog(
        user_id=user.id,
        word_id=word_id,
        card_id=card.id,
        rating=rating,
        review_type=str(data.get("reviewType", "review")),
        reviewed_at=reviewed_at,
        elapsed_seconds=data.get("elapsedSeconds"),
    )
    card.review_count += 1
    if rating == 1:
        card.wrong_count += 1
    else:
        card.correct_count += 1
    card.last_review_at = reviewed_at
    db.session.add(log)
    db.session.commit()
    return jsonify({"id": log.id, "reviewedAt": reviewed_at.isoformat()})


@api.get("/vocabularies")
@login_required
def vocabularies(user):
    rows = Vocabulary.query.filter((Vocabulary.kind == "system") | (Vocabulary.owner_user_id == user.id)).all()
    return jsonify([{
        "id": row.id,
        "name": row.name,
        "kind": row.kind,
        "ownerUserId": row.owner_user_id,
        "createdAt": row.created_at.isoformat(),
    } for row in rows])


@api.post("/vocabularies")
@login_required
def create_vocabulary(user):
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    if not name:
        return jsonify({"error": "name_required"}), 400
    vocabulary = Vocabulary(name=name, owner_user_id=user.id, kind="user")
    db.session.add(vocabulary)
    db.session.commit()
    return jsonify({"id": vocabulary.id, "name": vocabulary.name}), 201


@api.post("/vocabularies/<vocabulary_id>/words/<word_id>")
@login_required
def add_word_to_vocabulary(user, vocabulary_id, word_id):
    vocabulary = Vocabulary.query.filter_by(id=vocabulary_id).filter(
        (Vocabulary.kind == "system") | (Vocabulary.owner_user_id == user.id)
    ).first()
    if not vocabulary or not Word.query.filter_by(id=word_id).first():
        return jsonify({"error": "not_found"}), 404
    exists = VocabularyWord.query.filter_by(vocabulary_id=vocabulary_id, word_id=word_id).first()
    if not exists:
        db.session.add(VocabularyWord(vocabulary_id=vocabulary_id, word_id=word_id))
        db.session.commit()
    return jsonify({"ok": True})
