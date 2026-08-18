from datetime import date, datetime, timedelta
from functools import wraps

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from . import db
from .models import DailyPlan, ReviewLog, User, UserSetting, UserVocabulary, UserWordCard, Vocabulary, VocabularyWord, Word

api = Blueprint("api", __name__)

DAILY_QUOTAS = {50, 100, 150, 200, 250, 300}


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
            "createdAt": user.created_at.isoformat(), "lastLoginAt": user.last_login_at.isoformat() if user.last_login_at else None}


def card_json(card):
    return {"id": card.id, "wordId": card.word_id, "state": card.state, "stability": card.stability,
            "difficulty": card.difficulty, "dueAt": card.due_at.isoformat(),
            "firstLearnedAt": card.first_learned_at.isoformat() if card.first_learned_at else None,
            "lastReviewAt": card.last_review_at.isoformat() if card.last_review_at else None,
            "correctCount": card.correct_count, "wrongCount": card.wrong_count, "reviewCount": card.review_count}


def normalize_word(value):
    return " ".join(str(value or "").strip().lower().split())


def parse_client_datetime(value, fallback=None):
    if not value:
        return fallback or datetime.utcnow()
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return fallback or datetime.utcnow()


def visible_vocabulary_filter(user):
    return (Vocabulary.kind == "system") | (Vocabulary.owner_user_id == user.id)


def enabled_vocabulary_ids(user):
    rows = UserVocabulary.query.filter_by(user_id=user.id, enabled=True).all()
    return {row.vocabulary_id for row in rows}


def vocabulary_is_visible(user, vocabulary_id):
    return Vocabulary.query.filter_by(id=vocabulary_id).filter(visible_vocabulary_filter(user)).first()


def selected_word_ids(user):
    vocabulary_ids = enabled_vocabulary_ids(user)
    if not vocabulary_ids:
        return set()
    return {row.word_id for row in VocabularyWord.query.filter(VocabularyWord.vocabulary_id.in_(vocabulary_ids)).all()}


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
    core = Vocabulary.query.filter_by(name="考研英语核心词", kind="system").first()
    if core:
        existing = UserVocabulary.query.filter_by(user_id=user.id, vocabulary_id=core.id).first()
        if not existing:
            db.session.add(UserVocabulary(user_id=user.id, vocabulary_id=core.id, enabled=True, priority=core.priority))
    db.session.commit()
    session.clear()
    session["user_id"] = user.id
    return jsonify({"user": user_json(user)}), 201


@api.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    user = User.query.filter_by(email=str(data.get("email", "")).strip().lower()).first()
    if not user or not check_password_hash(user.password_hash, str(data.get("password", ""))) or user.status != "active":
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
    return jsonify({"dailyNewQuota": settings.daily_new_quota, "timezone": settings.timezone,
                    "soundEnabled": settings.sound_enabled, "autoPlayExample": settings.auto_play_example})


@api.put("/settings")
@login_required
def update_settings(user):
    data = request.get_json(silent=True) or {}
    settings = UserSetting.query.filter_by(user_id=user.id).first() or UserSetting(user_id=user.id)
    if "dailyNewQuota" in data:
        try:
            quota = int(data["dailyNewQuota"])
        except (TypeError, ValueError):
            return jsonify({"error": "invalid_daily_quota"}), 400
        if quota not in DAILY_QUOTAS:
            return jsonify({"error": "invalid_daily_quota", "allowed": sorted(DAILY_QUOTAS)}), 400
        settings.daily_new_quota = quota
        plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=date.today()).first()
        if plan:
            plan.new_quota = quota
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
    return jsonify([card_json(row) for row in UserWordCard.query.filter_by(user_id=user.id).all()])


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
    mapping = {"state": "state", "stability": "stability", "difficulty": "difficulty",
               "correctCount": "correct_count", "wrongCount": "wrong_count", "reviewCount": "review_count"}
    for key, attr in mapping.items():
        if key in data:
            setattr(card, attr, data[key])
    if "dueAt" in data:
        card.due_at = parse_client_datetime(data["dueAt"])
    if "lastReviewAt" in data:
        card.last_review_at = parse_client_datetime(data["lastReviewAt"])
    db.session.commit()
    return jsonify(card_json(card))


@api.get("/sync/study")
@login_required
def sync_study(user):
    cards = UserWordCard.query.filter_by(user_id=user.id).all()
    logs = ReviewLog.query.filter_by(user_id=user.id).order_by(ReviewLog.reviewed_at.asc()).all()
    return jsonify({"cards": [card_json(c) for c in cards],
                    "reviews": [{"id": r.id, "wordId": r.word_id, "rating": r.rating,
                                 "reviewedAt": r.reviewed_at.isoformat(), "reviewType": r.review_type} for r in logs]})


@api.get("/words")
@login_required
def words(user):
    query = Word.query
    args = request.args
    vocabulary_id = args.get("vocabularyId")
    if vocabulary_id:
        if not vocabulary_is_visible(user, vocabulary_id):
            return jsonify({"error": "not_found"}), 404
        query = query.join(VocabularyWord, VocabularyWord.word_id == Word.id).filter(VocabularyWord.vocabulary_id == vocabulary_id)
    elif args.get("selectedOnly", "1") != "0":
        ids = selected_word_ids(user)
        if not ids:
            return jsonify([])
        query = query.filter(Word.id.in_(ids))
    if args.get("q"):
        query = query.filter(Word.normalized_word.like(f"%{normalize_word(args['q'])}%"))
    if args.get("category"):
        query = query.filter_by(category=args["category"])
    if args.get("source"):
        query = query.filter_by(source=args["source"])
    rows = query.order_by(Word.category.asc(), Word.created_at.asc()).limit(min(int(args.get("limit", 100)), 500)).all()
    return jsonify([{"id": w.id, "word": w.word, "type": w.word_type, "meaning": w.meaning,
                     "category": w.category, "source": w.source, "sourceDetail": w.source_detail} for w in rows])


@api.get("/study/today")
@login_required
def study_today(user):
    today = date.today()
    settings = UserSetting.query.filter_by(user_id=user.id).first() or UserSetting(user_id=user.id)
    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()

    selected_ids = selected_word_ids(user)
    due_query = UserWordCard.query.filter(UserWordCard.user_id == user.id,
                                          UserWordCard.due_at <= datetime.utcnow(),
                                          UserWordCard.state != "new")
    if selected_ids:
        due_query = due_query.filter(UserWordCard.word_id.in_(selected_ids))
    else:
        due_query = due_query.filter(False)
    due = due_query.order_by(UserWordCard.due_at.asc()).all()

    if not plan:
        plan = DailyPlan(user_id=user.id, plan_date=today, new_quota=settings.daily_new_quota,
                         mandatory_total=len(due), mandatory_completed=0)
        db.session.add(plan)
    elif plan.mandatory_total == 0 and due and plan.mandatory_completed == 0:
        plan.mandatory_total = len(due)

    active_words = {c.word_id for c in UserWordCard.query.filter_by(user_id=user.id).all()}
    category_weight = {"核心词": 100, "长难词": 95, "难词": 90, "短语": 85, "固定搭配": 85}
    candidate_query = Word.query.filter(Word.id.in_(selected_ids - active_words)) if selected_ids else Word.query.filter(False)
    candidates = candidate_query.all()
    candidates.sort(key=lambda w: (-category_weight.get(w.category, 50), w.created_at))
    new_words = candidates[:settings.daily_new_quota]

    if plan.new_quota != settings.daily_new_quota:
        plan.new_quota = settings.daily_new_quota
    plan.new_completed = min(plan.new_completed, len(new_words))

    day_start = datetime.combine(today, datetime.min.time())
    today_logs = ReviewLog.query.filter(ReviewLog.user_id == user.id, ReviewLog.reviewed_at >= day_start).all()
    db.session.commit()

    mandatory_remaining = max(0, plan.mandatory_total - plan.mandatory_completed)
    return jsonify({"date": today.isoformat(), "review": [card_json(c) for c in due],
                    "newWords": [{"id": w.id, "word": w.word, "type": w.word_type, "meaning": w.meaning,
                                  "category": w.category, "source": w.source} for w in new_words],
                    "newTotal": len(new_words), "newCompleted": plan.new_completed,
                    "reviewTotal": len(due), "reviewCompleted": len(today_logs),
                    "mandatoryTotal": plan.mandatory_total, "mandatoryCompleted": plan.mandatory_completed,
                    "mandatoryRemaining": mandatory_remaining, "newUnlocked": mandatory_remaining == 0,
                    "selfCompleted": plan.self_completed})


@api.post("/reviews")
@login_required
def create_review(user):
    data = request.get_json(silent=True) or {}
    word_id = str(data.get("wordId", ""))
    rating = int(data.get("rating", 0))
    review_id = str(data.get("reviewId", "")).strip()
    review_type = str(data.get("reviewType", "review"))
    if rating not in (1, 2, 3, 4):
        return jsonify({"error": "invalid_rating"}), 400
    if review_type not in {"new", "mandatory", "self", "review"}:
        return jsonify({"error": "invalid_review_type"}), 400
    if not word_id:
        return jsonify({"error": "word_required"}), 400
    if not Word.query.filter_by(id=word_id).first():
        return jsonify({"error": "word_not_found"}), 404

    if review_id:
        existing = ReviewLog.query.filter_by(id=review_id, user_id=user.id).first()
        if existing:
            existing_card_row = UserWordCard.query.filter_by(id=existing.card_id, user_id=user.id).first()
            return jsonify({"review": {"id": existing.id, "reviewedAt": existing.reviewed_at.isoformat()},
                            "card": card_json(existing_card_row) if existing_card_row else None, "duplicate": True})

    today = date.today()
    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()
    if review_type == "new" and plan:
        mandatory_remaining = max(0, plan.mandatory_total - plan.mandatory_completed)
        if mandatory_remaining > 0:
            return jsonify({"error": "mandatory_review_required", "remaining": mandatory_remaining}), 409
        if plan.new_completed >= plan.new_quota:
            return jsonify({"error": "daily_new_quota_reached", "quota": plan.new_quota}), 409

    reviewed_at = parse_client_datetime(data.get("reviewedAt"))
    card_payload = data.get("card") if isinstance(data.get("card"), dict) else {}
    card = UserWordCard.query.filter_by(user_id=user.id, word_id=word_id).first()
    if not card:
        card = UserWordCard(user_id=user.id, word_id=word_id, first_learned_at=reviewed_at)
        db.session.add(card)
        db.session.flush()

    previous_review_count = card.review_count
    card.review_count = int(card_payload.get("reviewCount", previous_review_count + 1))
    card.correct_count = int(card_payload.get("correctCount", card.correct_count + (0 if rating == 1 else 1)))
    card.wrong_count = int(card_payload.get("wrongCount", card.wrong_count + (1 if rating == 1 else 0)))
    card.state = str(card_payload.get("state", card.state))
    card.stability = float(card_payload.get("stability", card.stability))
    card.difficulty = float(card_payload.get("difficulty", card.difficulty))
    card.due_at = parse_client_datetime(card_payload.get("dueAt"), reviewed_at)
    card.last_review_at = reviewed_at
    if not card.first_learned_at:
        card.first_learned_at = reviewed_at

    log = ReviewLog(id=review_id or None, user_id=user.id, word_id=word_id, card_id=card.id,
                    rating=rating, review_type=review_type, reviewed_at=reviewed_at,
                    elapsed_seconds=data.get("elapsedSeconds"))
    db.session.add(log)

    if not plan:
        settings = UserSetting.query.filter_by(user_id=user.id).first() or UserSetting(user_id=user.id)
        plan = DailyPlan(user_id=user.id, plan_date=today, new_quota=settings.daily_new_quota)
        db.session.add(plan)
    if review_type == "new":
        plan.new_completed += 1
    elif review_type == "mandatory":
        plan.mandatory_completed = min(plan.mandatory_total, plan.mandatory_completed + 1)
    elif review_type == "self":
        plan.self_completed += 1
    db.session.commit()
    return jsonify({"review": {"id": log.id, "reviewedAt": reviewed_at.isoformat()}, "card": card_json(card)})


@api.get("/vocabularies")
@login_required
def vocabularies(user):
    rows = Vocabulary.query.filter(visible_vocabulary_filter(user)).order_by(Vocabulary.priority.desc()).all()
    enabled_ids = enabled_vocabulary_ids(user)
    return jsonify([{"id": r.id, "name": r.name, "kind": r.kind, "priority": r.priority,
                     "description": r.description, "ownerUserId": r.owner_user_id,
                     "enabled": r.id in enabled_ids, "createdAt": r.created_at.isoformat()} for r in rows])


@api.put("/vocabularies/<vocabulary_id>/selection")
@login_required
def set_vocabulary_selection(user, vocabulary_id):
    vocabulary = vocabulary_is_visible(user, vocabulary_id)
    if not vocabulary:
        return jsonify({"error": "not_found"}), 404
    data = request.get_json(silent=True) or {}
    enabled = bool(data.get("enabled", True))
    row = UserVocabulary.query.filter_by(user_id=user.id, vocabulary_id=vocabulary_id).first()
    if not row:
        row = UserVocabulary(user_id=user.id, vocabulary_id=vocabulary_id,
                             enabled=enabled, priority=vocabulary.priority)
        db.session.add(row)
    else:
        row.enabled = enabled
    db.session.commit()
    return jsonify({"id": vocabulary_id, "enabled": row.enabled})


@api.get("/vocabularies/<vocabulary_id>")
@login_required
def vocabulary_detail(user, vocabulary_id):
    vocabulary = vocabulary_is_visible(user, vocabulary_id)
    if not vocabulary:
        return jsonify({"error": "not_found"}), 404
    links = VocabularyWord.query.filter_by(vocabulary_id=vocabulary.id).order_by(VocabularyWord.priority.desc(), VocabularyWord.created_at.asc()).all()
    word_ids = [link.word_id for link in links]
    word_map = {w.id: w for w in Word.query.filter(Word.id.in_(word_ids)).all()} if word_ids else {}
    return jsonify({"id": vocabulary.id, "name": vocabulary.name, "kind": vocabulary.kind,
                    "priority": vocabulary.priority, "description": vocabulary.description,
                    "wordCount": len(word_ids),
                    "words": [{"id": w.id, "word": w.word, "type": w.word_type, "meaning": w.meaning,
                               "category": w.category, "priority": link.priority}
                              for link in links if (w := word_map.get(link.word_id))]})


@api.get("/vocabularies/<vocabulary_id>/stats")
@login_required
def vocabulary_stats(user, vocabulary_id):
    vocabulary = vocabulary_is_visible(user, vocabulary_id)
    if not vocabulary:
        return jsonify({"error": "not_found"}), 404
    word_ids = {link.word_id for link in VocabularyWord.query.filter_by(vocabulary_id=vocabulary.id).all()}
    cards = UserWordCard.query.filter(UserWordCard.user_id == user.id, UserWordCard.word_id.in_(word_ids)).all() if word_ids else []
    learned = [c for c in cards if c.review_count > 0]
    due = [c for c in learned if c.due_at <= datetime.utcnow()]
    return jsonify({"vocabularyId": vocabulary.id, "wordCount": len(word_ids), "learned": len(learned),
                    "due": len(due), "new": len(word_ids) - len(learned),
                    "masteryRate": round(len([c for c in learned if c.state == "review"]) / len(word_ids) * 100, 1) if word_ids else 0})
