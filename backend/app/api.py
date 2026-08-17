from datetime import date, datetime, timedelta
from functools import wraps

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from . import db
from .models import DailyPlan, ReviewLog, User, UserSetting, UserVocabulary, UserWordCard, Vocabulary, VocabularyWord, Word

api = Blueprint("api", __name__)


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


def user_json(user):
    return {"id": user.id, "email": user.email, "nickname": user.nickname, "status": user.status,
            "createdAt": user.created_at.isoformat(), "lastLoginAt": user.last_login_at.isoformat() if user.last_login_at else None}


def card_json(card):
    return {"id": card.id, "wordId": card.word_id, "state": card.state, "stability": card.stability,
            "difficulty": card.difficulty, "dueAt": card.due_at.isoformat(),
            "firstLearnedAt": card.first_learned_at.isoformat() if card.first_learned_at else None,
            "lastReviewAt": card.last_review_at.isoformat() if card.last_review_at else None,
            "correctCount": card.correct_count, "wrongCount": card.wrong_count, "reviewCount": card.review_count}


def normalize_word(value): return " ".join(str(value or "").strip().lower().split())


def parse_client_datetime(value, fallback=None):
    if not value: return fallback or datetime.utcnow()
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return fallback or datetime.utcnow()


@api.get("/health")
def health(): return jsonify({"ok": True})


@api.post("/auth/register")
def register():
    data = request.get_json(silent=True) or {}; email = str(data.get("email", "")).strip().lower(); password = str(data.get("password", "")); nickname = str(data.get("nickname", "考研用户")).strip() or "考研用户"
    if len(email) < 5 or "@" not in email: return jsonify({"error": "invalid_email"}), 400
    if len(password) < 8: return jsonify({"error": "password_too_short"}), 400
    if User.query.filter_by(email=email).first(): return jsonify({"error": "email_exists"}), 409
    user = User(email=email, password_hash=generate_password_hash(password), nickname=nickname); db.session.add(user); db.session.flush(); db.session.add(UserSetting(user_id=user.id))
    core = Vocabulary.query.filter_by(name="考研英语核心词", kind="system").first()
    if core: db.session.add(UserVocabulary(user_id=user.id, vocabulary_id=core.id, enabled=True, priority=core.priority))
    db.session.commit(); session.clear(); session["user_id"] = user.id
    return jsonify({"user": user_json(user)}), 201


@api.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}; user = User.query.filter_by(email=str(data.get("email", "")).strip().lower()).first()
    if not user or not check_password_hash(user.password_hash, str(data.get("password", ""))) or user.status != "active": return jsonify({"error": "invalid_credentials"}), 401
    user.last_login_at = datetime.utcnow(); db.session.commit(); session.clear(); session["user_id"] = user.id; return jsonify({"user": user_json(user)})


@api.post("/auth/logout")
def logout(): session.clear(); return jsonify({"ok": True})


@api.get("/auth/me")
def me():
    user = current_user(); return jsonify({"user": user_json(user) if user else None})


@api.get("/settings")
@login_required
def get_settings(user):
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    if not settings: settings = UserSetting(user_id=user.id); db.session.add(settings); db.session.commit()
    return jsonify({"dailyNewQuota": settings.daily_new_quota, "timezone": settings.timezone, "soundEnabled": settings.sound_enabled, "autoPlayExample": settings.auto_play_example})


@api.put("/settings")
@login_required
def update_settings(user):
    data = request.get_json(silent=True) or {}; settings = UserSetting.query.filter_by(user_id=user.id).first() or UserSetting(user_id=user.id)
    if "dailyNewQuota" in data: settings.daily_new_quota = max(0, min(int(data["dailyNewQuota"]), 1000))
    if "timezone" in data: settings.timezone = str(data["timezone"])
    if "soundEnabled" in data: settings.sound_enabled = bool(data["soundEnabled"])
    if "autoPlayExample" in data: settings.auto_play_example = bool(data["autoPlayExample"])
    db.session.add(settings); db.session.commit(); return get_settings(user)


@api.get("/cards")
@login_required
def cards(user): return jsonify([card_json(row) for row in UserWordCard.query.filter_by(user_id=user.id).all()])


@api.put("/cards/<word_id>")
@login_required
def upsert_card(user, word_id):
    data = request.get_json(silent=True) or {}; card = UserWordCard.query.filter_by(user_id=user.id, word_id=word_id).first()
    if not card:
        if not Word.query.filter_by(id=word_id).first(): return jsonify({"error": "word_not_found"}), 404
        card = UserWordCard(user_id=user.id, word_id=word_id); db.session.add(card)
    mapping = {"state": "state", "stability": "stability", "difficulty": "difficulty", "correctCount": "correct_count", "wrongCount": "wrong_count", "reviewCount": "review_count"}
    for key, attr in mapping.items():
        if key in data: setattr(card, attr, data[key])
    if "dueAt" in data: card.due_at = parse_client_datetime(data["dueAt"])
    if "lastReviewAt" in data: card.last_review_at = parse_client_datetime(data["lastReviewAt"])
    db.session.commit(); return jsonify(card_json(card))


@api.get("/sync/study")
@login_required
def sync_study(user):
    cards = UserWordCard.query.filter_by(user_id=user.id).all(); logs = ReviewLog.query.filter_by(user_id=user.id).order_by(ReviewLog.reviewed_at.asc()).all()
    return jsonify({"cards": [card_json(c) for c in cards], "reviews": [{"id": r.id, "wordId": r.word_id, "rating": r.rating, "reviewedAt": r.reviewed_at.isoformat(), "reviewType": r.review_type} for r in logs]})


@api.get("/words")
@login_required
def words(user):
    query = Word.query; args = request.args
    if args.get("q"): query = query.filter(Word.normalized_word.like(f"%{normalize_word(args['q'])}%"))
    if args.get("category"): query = query.filter_by(category=args["category"])
    if args.get("source"): query = query.filter_by(source=args["source"])
    if args.get("vocabularyId"): query = query.join(VocabularyWord, VocabularyWord.word_id == Word.id).filter(VocabularyWord.vocabulary_id == args["vocabularyId"])
    rows = query.order_by(Word.category.asc(), Word.created_at.asc()).limit(min(int(args.get("limit", 100)), 500)).all()
    return jsonify([{"id": w.id, "word": w.word, "type": w.word_type, "meaning": w.meaning, "category": w.category, "source": w.source, "sourceDetail": w.source_detail} for w in rows])


@api.get("/study/today")
@login_required
def study_today(user):
    today = date.today(); settings = UserSetting.query.filter_by(user_id=user.id).first() or UserSetting(user_id=user.id); plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()
    if not plan: plan = DailyPlan(user_id=user.id, plan_date=today, new_quota=settings.daily_new_quota); db.session.add(plan); db.session.commit()
    due = UserWordCard.query.filter(UserWordCard.user_id == user.id, UserWordCard.due_at <= datetime.utcnow(), UserWordCard.state != "new").order_by(UserWordCard.due_at.asc()).all()
    active_words = {c.word_id for c in UserWordCard.query.filter_by(user_id=user.id).all()}; category_weight = {"核心词": 100, "长难词": 95, "难词": 90, "短语": 85, "固定搭配": 85}
    candidates = Word.query.filter(~Word.id.in_(active_words)).all() if active_words else Word.query.all(); candidates.sort(key=lambda w: (-category_weight.get(w.category, 50), w.created_at)); new_words = candidates[:settings.daily_new_quota]
    plan.new_quota = len(new_words); plan.new_completed = min(plan.new_completed, len(new_words)); db.session.commit()
    return jsonify({"date": today.isoformat(), "review": [card_json(c) for c in due], "newWords": [{"id": w.id, "word": w.word, "type": w.word_type, "meaning": w.meaning, "category": w.category, "source": w.source} for w in new_words], "newTotal": len(new_words), "newCompleted": plan.new_completed, "reviewTotal": len(due), "reviewCompleted": ReviewLog.query.filter(ReviewLog.user_id == user.id, ReviewLog.reviewed_at >= datetime.combine(today, datetime.min.time())).count()})


@api.post("/reviews")
@login_required
def create_review(user):
    data = request.get_json(silent=True) or {}
    word_id = str(data.get("wordId", "")); rating = int(data.get("rating", 0)); review_id = str(data.get("reviewId", "")).strip()
    if rating not in (1, 2, 3, 4): return jsonify({"error": "invalid_rating"}), 400
    if not word_id: return jsonify({"error": "word_required"}), 400
    if review_id:
        existing = ReviewLog.query.filter_by(id=review_id, user_id=user.id).first()
        if existing:
            existing_card_row = UserWordCard.query.filter_by(id=existing.card_id, user_id=user.id).first()
            return jsonify({"review": {"id": existing.id, "reviewedAt": existing.reviewed_at.isoformat()}, "card": card_json(existing_card_row) if existing_card_row else None, "duplicate": True})

    reviewed_at = parse_client_datetime(data.get("reviewedAt"))
    card_payload = data.get("card") if isinstance(data.get("card"), dict) else {}
    card = UserWordCard.query.filter_by(user_id=user.id, word_id=word_id).first()
    if not card:
        if not Word.query.filter_by(id=word_id).first(): return jsonify({"error": "word_not_found"}), 404
        card = UserWordCard(user_id=user.id, word_id=word_id, first_learned_at=reviewed_at); db.session.add(card); db.session.flush()

    previous_review_count = card.review_count
    card.review_count = int(card_payload.get("reviewCount", previous_review_count + 1))
    card.correct_count = int(card_payload.get("correctCount", card.correct_count + (0 if rating == 1 else 1)))
    card.wrong_count = int(card_payload.get("wrongCount", card.wrong_count + (1 if rating == 1 else 0)))
    card.state = str(card_payload.get("state", card.state))
    card.stability = float(card_payload.get("stability", card.stability))
    card.difficulty = float(card_payload.get("difficulty", card.difficulty))
    card.due_at = parse_client_datetime(card_payload.get("dueAt"), reviewed_at)
    card.last_review_at = reviewed_at
    if not card.first_learned_at: card.first_learned_at = reviewed_at

    log = ReviewLog(id=review_id or None, user_id=user.id, word_id=word_id, card_id=card.id,
                    rating=rating, review_type=str(data.get("reviewType", "review")), reviewed_at=reviewed_at,
                    elapsed_seconds=data.get("elapsedSeconds"))
    db.session.add(log); db.session.commit()
    return jsonify({"review": {"id": log.id, "reviewedAt": reviewed_at.isoformat()}, "card": card_json(card)})


@api.get("/vocabularies")
@login_required
def vocabularies(user):
    rows = Vocabulary.query.filter((Vocabulary.kind == "system") | (Vocabulary.owner_user_id == user.id)).order_by(Vocabulary.priority.desc()).all()
    return jsonify([{"id": r.id, "name": r.name, "kind": r.kind, "priority": r.priority, "description": r.description, "ownerUserId": r.owner_user_id, "createdAt": r.created_at.isoformat()} for r in rows])


@api.get("/vocabularies/<vocabulary_id>")
@login_required
def vocabulary_detail(user, vocabulary_id):
    vocabulary = Vocabulary.query.filter_by(id=vocabulary_id).filter((Vocabulary.kind == "system") | (Vocabulary.owner_user_id == user.id)).first()
    if not vocabulary: return jsonify({"error": "not_found"}), 404
    links = VocabularyWord.query.filter_by(vocabulary_id=vocabulary.id).order_by(VocabularyWord.priority.desc(), VocabularyWord.created_at.asc()).all()
    word_ids = [link.word_id for link in links]; word_map = {w.id: w for w in Word.query.filter(Word.id.in_(word_ids)).all()} if word_ids else {}
    return jsonify({"id": vocabulary.id, "name": vocabulary.name, "kind": vocabulary.kind, "priority": vocabulary.priority, "description": vocabulary.description, "wordCount": len(word_ids), "words": [{"id": w.id, "word": w.word, "type": w.word_type, "meaning": w.meaning, "category": w.category, "priority": link.priority} for link in links if (w := word_map.get(link.word_id))]})


@api.get("/vocabularies/<vocabulary_id>/stats")
@login_required
def vocabulary_stats(user, vocabulary_id):
    vocabulary = Vocabulary.query.filter_by(id=vocabulary_id).filter((Vocabulary.kind == "system") | (Vocabulary.owner_user_id == user.id)).first()
    if not vocabulary: return jsonify({"error": "not_found"}), 404
    word_ids = {link.word_id for link in VocabularyWord.query.filter_by(vocabulary_id=vocabulary.id).all()}
    cards = UserWordCard.query.filter(UserWordCard.user_id == user.id, UserWordCard.word_id.in_(word_ids)).all() if word_ids else []
    learned = [c for c in cards if c.review_count > 0]; due = [c for c in learned if c.due_at <= datetime.utcnow()]
    return jsonify({"vocabularyId": vocabulary.id, "wordCount": len(word_ids), "learned": len(learned), "due": len(due), "new": len(word_ids) - len(learned), "masteryRate": round(len([c for c in learned if c.state == "review"]) / len(word_ids) * 100, 1) if word_ids else 0})


@api.post("/vocabularies")
@login_required
def create_vocabulary(user):
    data = request.get_json(silent=True) or {}; name = str(data.get("name", "")).strip()
    if not name: return jsonify({"error": "name_required"}), 400
    vocabulary = Vocabulary(name=name, owner_user_id=user.id, kind="user", priority=50, description=str(data.get("description", ""))); db.session.add(vocabulary); db.session.commit(); return jsonify({"id": vocabulary.id, "name": vocabulary.name}), 201


@api.post("/vocabularies/<vocabulary_id>/words/<word_id>")
@login_required
def add_word_to_vocabulary(user, vocabulary_id, word_id):
    vocabulary = Vocabulary.query.filter_by(id=vocabulary_id).filter((Vocabulary.kind == "system") | (Vocabulary.owner_user_id == user.id)).first()
    if not vocabulary or not Word.query.filter_by(id=word_id).first(): return jsonify({"error": "not_found"}), 404
    if not VocabularyWord.query.filter_by(vocabulary_id=vocabulary_id, word_id=word_id).first(): db.session.add(VocabularyWord(vocabulary_id=vocabulary_id, word_id=word_id))
    db.session.commit(); return jsonify({"ok": True})
