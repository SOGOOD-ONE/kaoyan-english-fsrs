from datetime import date, datetime, timedelta
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
    return {"id": user.id, "email": user.email, "nickname": user.nickname, "status": user.status,
            "createdAt": user.created_at.isoformat(),
            "lastLoginAt": user.last_login_at.isoformat() if user.last_login_at else None}


def card_json(card):
    return {"id": card.id, "wordId": card.word_id, "state": card.state,
            "stability": card.stability, "difficulty": card.difficulty,
            "dueAt": card.due_at.isoformat(),
            "firstLearnedAt": card.first_learned_at.isoformat() if card.first_learned_at else None,
            "lastReviewAt": card.last_review_at.isoformat() if card.last_review_at else None,
            "correctCount": card.correct_count, "wrongCount": card.wrong_count,
            "reviewCount": card.review_count}


@api.get("/health")
def health():
    return jsonify({"ok": True})


@api.post("/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    email, password = str(data.get("email", "")).strip().lower(), str(data.get("password", ""))
    nickname = str(data.get("nickname", "考研用户")).strip() or "考研用户"
    if len(email) < 5 or "@" not in email: return jsonify({"error": "invalid_email"}), 400
    if len(password) < 8: return jsonify({"error": "password_too_short"}), 400
    if User.query.filter_by(email=email).first(): return jsonify({"error": "email_exists"}), 409
    user = User(email=email, password_hash=generate_password_hash(password), nickname=nickname)
    db.session.add(user); db.session.flush(); db.session.add(UserSetting(user_id=user.id)); db.session.commit()
    session.clear(); session["user_id"] = user.id
    return jsonify({"user": user_json(user)}), 201


@api.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    user = User.query.filter_by(email=str(data.get("email", "")).strip().lower()).first()
    if not user or not check_password_hash(user.password_hash, str(data.get("password", ""))) or user.status != "active":
        return jsonify({"error": "invalid_credentials"}), 401
    user.last_login_at = datetime.utcnow(); db.session.commit()
    session.clear(); session["user_id"] = user.id
    return jsonify({"user": user_json(user)})


@api.post("/auth/logout")
def logout(): session.clear(); return jsonify({"ok": True})


@api.get("/auth/me")
def me():
    user = current_user(); return jsonify({"user": user_json(user) if user else None})


@api.get("/settings")
@login_required
def get_settings(user):
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    if not settings:
        settings = UserSetting(user_id=user.id); db.session.add(settings); db.session.commit()
    return jsonify({"dailyNewQuota": settings.daily_new_quota, "timezone": settings.timezone,
                    "soundEnabled": settings.sound_enabled, "autoPlayExample": settings.auto_play_example})


@api.put("/settings")
@login_required
def update_settings(user):
    data = request.get_json(silent=True) or {}
    settings = UserSetting.query.filter_by(user_id=user.id).first() or UserSetting(user_id=user.id)
    if "dailyNewQuota" in data: settings.daily_new_quota = max(0, min(int(data["dailyNewQuota"]), 1000))
    if "timezone" in data: settings.timezone = str(data["timezone"])
    if "soundEnabled" in data: settings.sound_enabled = bool(data["soundEnabled"])
    if "autoPlayExample" in data: settings.auto_play_example = bool(data["autoPlayExample"])
    db.session.add(settings); db.session.commit(); return get_settings(user)


@api.get("/cards")
@login_required
def cards(user):
    return jsonify([card_json(row) for row in UserWordCard.query.filter_by(user_id=user.id).all()])


@api.put("/cards/<word_id>")
@login_required
def upsert_card(user, word_id):
    data = request.get_json(silent=True) or {}
    card = UserWordCard.query.filter_by(user_id=user.id, word_id=word_id).first()
    if not card:
        if not Word.query.filter_by(id=word_id).first(): return jsonify({"error": "word_not_found"}), 404
        card = UserWordCard(user_id=user.id, word_id=word_id); db.session.add(card)
    mapping = {"state": "state", "stability": "stability", "difficulty": "difficulty",
               "correctCount": "correct_count", "wrongCount": "wrong_count", "reviewCount": "review_count"}
    for key, attr in mapping.items():
        if key in data: setattr(card, attr, data[key])
    if "dueAt" in data: card.due_at = datetime.fromisoformat(data["dueAt"].replace("Z", "+00:00")).replace(tzinfo=None)
    db.session.commit(); return jsonify(card_json(card))


@api.get("/study/today")
@login_required
def study_today(user):
    """Build today's queue: overdue reviews first, then mandatory new words, then optional self-study."""
    today = date.today()
    settings = UserSetting.query.filter_by(user_id=user.id).first() or UserSetting(user_id=user.id)
    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()
    if not plan:
        plan = DailyPlan(user_id=user.id, plan_date=today, new_quota=settings.daily_new_quota)
        db.session.add(plan); db.session.commit()

    due = UserWordCard.query.filter(UserWordCard.user_id == user.id,
                                    UserWordCard.due_at <= datetime.utcnow(),
                                    UserWordCard.state != "new").order_by(UserWordCard.due_at.asc()).all()
    active_words = {c.word_id for c in UserWordCard.query.filter_by(user_id=user.id).all()}
    new_words = Word.query.order_by(Word.created_at.asc()).limit(max(settings.daily_new_quota * 2, 100)).all()
    new_ids = [w.id for w in new_words if w.id not in active_words][:settings.daily_new_quota]
    plan.new_completed = min(plan.new_completed, len(new_ids))
    plan.new_quota = len(new_ids)
    db.session.commit()
    return jsonify({"date": today.isoformat(), "review": [card_json(c) for c in due],
                    "newWordIds": new_ids, "newTotal": len(new_ids),
                    "newCompleted": plan.new_completed, "reviewTotal": len(due),
                    "reviewCompleted": ReviewLog.query.filter(ReviewLog.user_id == user.id,
                        ReviewLog.reviewed_at >= datetime.combine(today, datetime.min.time())).count()})


@api.post("/reviews")
@login_required
def create_review(user):
    data = request.get_json(silent=True) or {}
    word_id = str(data.get("wordId", "")); rating = int(data.get("rating", 0))
    if rating not in (1, 2, 3, 4): return jsonify({"error": "invalid_rating"}), 400
    card = UserWordCard.query.filter_by(user_id=user.id, word_id=word_id).first()
    if not card:
        if not Word.query.filter_by(id=word_id).first(): return jsonify({"error": "word_not_found"}), 404
        card = UserWordCard(user_id=user.id, word_id=word_id, first_learned_at=datetime.utcnow())
        db.session.add(card); db.session.flush()
    reviewed_at = datetime.utcnow()
    log = ReviewLog(user_id=user.id, word_id=word_id, card_id=card.id, rating=rating,
                    review_type=str(data.get("reviewType", "review")), reviewed_at=reviewed_at,
                    elapsed_seconds=data.get("elapsedSeconds"))
    card.review_count += 1; card.last_review_at = reviewed_at
    if rating == 1: card.wrong_count += 1
    else: card.correct_count += 1
    # Transitional scheduler: hard failures return tomorrow; successful answers get progressively longer intervals.
    intervals = {1: 1, 2: 1, 3: 3, 4: 7}
    if rating == 1: card.state = "relearning"
    elif card.review_count == 1: card.state = "learning"
    else: card.state = "review"
    card.stability = max(1.0, card.stability * 1.35 + (rating - 2) * 0.35)
    card.difficulty = min(10.0, max(1.0, card.difficulty + ({1: 1.0, 2: 0.4, 3: -0.2, 4: -0.4}[rating])))
    card.due_at = reviewed_at + timedelta(days=intervals[rating])
    db.session.add(log); db.session.commit()
    return jsonify({"review": {"id": log.id, "reviewedAt": reviewed_at.isoformat()}, "card": card_json(card)})


@api.get("/vocabularies")
@login_required
def vocabularies(user):
    rows = Vocabulary.query.filter((Vocabulary.kind == "system") | (Vocabulary.owner_user_id == user.id)).all()
    return jsonify([{"id": r.id, "name": r.name, "kind": r.kind, "ownerUserId": r.owner_user_id,
                     "createdAt": r.created_at.isoformat()} for r in rows])


@api.post("/vocabularies")
@login_required
def create_vocabulary(user):
    name = str((request.get_json(silent=True) or {}).get("name", "")).strip()
    if not name: return jsonify({"error": "name_required"}), 400
    vocabulary = Vocabulary(name=name, owner_user_id=user.id, kind="user")
    db.session.add(vocabulary); db.session.commit(); return jsonify({"id": vocabulary.id, "name": vocabulary.name}), 201


@api.post("/vocabularies/<vocabulary_id>/words/<word_id>")
@login_required
def add_word_to_vocabulary(user, vocabulary_id, word_id):
    vocabulary = Vocabulary.query.filter_by(id=vocabulary_id).filter(
        (Vocabulary.kind == "system") | (Vocabulary.owner_user_id == user.id)).first()
    if not vocabulary or not Word.query.filter_by(id=word_id).first(): return jsonify({"error": "not_found"}), 404
    if not VocabularyWord.query.filter_by(vocabulary_id=vocabulary_id, word_id=word_id).first():
        db.session.add(VocabularyWord(vocabulary_id=vocabulary_id, word_id=word_id)); db.session.commit()
    return jsonify({"ok": True})
