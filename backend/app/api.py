from datetime import date, datetime, timedelta
from functools import wraps

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from . import db
from .models import DailyPlan, ReviewLog, User, UserSetting, UserVocabulary, UserWordCard, Vocabulary, VocabularyWord, Word
from .time_utils import local_day_start_utc, local_today, local_now, DEFAULT_TIMEZONE

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
    """Serialize user for API responses (no email - privacy)."""
    return {"id": user.id, "nickname": user.nickname, "status": user.status,
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


def parse_sync_since(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


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


def apply_card_snapshot_monotonic(card, snapshot, reviewed_at):
    """Apply a client card snapshot only when it is newer than the stored card."""
    current_reviewed_at = card.last_review_at
    if current_reviewed_at is not None and reviewed_at <= current_reviewed_at:
        return False
    try:
        # Validate and apply card snapshot with bounds checking
        valid_states = {"new", "learning", "review", "relearning"}
        new_state = str(snapshot.get("state", card.state))
        if new_state in valid_states:
            card.state = new_state
        new_stability = float(snapshot.get("stability", card.stability or 0.0))
        card.stability = max(0.0, min(new_stability, 36500.0))  # 100yr max
        new_difficulty = float(snapshot.get("difficulty", card.difficulty or 5.0))
        card.difficulty = max(1.0, min(new_difficulty, 10.0))  # FSRS difficulty range
        new_due = parse_client_datetime(snapshot.get("dueAt"), card.due_at)
        # Clamp due_at to reasonable range (within 100 years)
        max_due = datetime.utcnow() + timedelta(days=36500)
        if new_due and new_due <= max_due:
            card.due_at = new_due
        new_review_count = int(snapshot.get("reviewCount", card.review_count or 0))
        card.review_count = max(0, min(new_review_count, 100000))
        new_wrong_count = int(snapshot.get("wrongCount", card.wrong_count or 0))
        card.wrong_count = max(0, min(new_wrong_count, 100000))
        new_correct_count = int(snapshot.get("correctCount", card.correct_count or 0))
        card.correct_count = max(0, min(new_correct_count, 100000))
    except (TypeError, ValueError):
        raise ValueError("invalid_card")
    return True


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
    db.session.add(UserSetting(user_id=user.id, timezone=DEFAULT_TIMEZONE))
    for vocabulary_name in ("考研英语核心词", "考研英语大纲5500词"):
        vocabulary = Vocabulary.query.filter_by(name=vocabulary_name, kind="system").first()
        if not vocabulary:
            continue
        existing = UserVocabulary.query.filter_by(user_id=user.id, vocabulary_id=vocabulary.id).first()
        if not existing:
            db.session.add(UserVocabulary(user_id=user.id, vocabulary_id=vocabulary.id, enabled=True, priority=vocabulary.priority))
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
        settings = UserSetting(user_id=user.id, timezone=DEFAULT_TIMEZONE)
        db.session.add(settings)
    elif settings.timezone != DEFAULT_TIMEZONE:
        settings.timezone = DEFAULT_TIMEZONE
    db.session.commit()
    return jsonify({"dailyNewQuota": settings.daily_new_quota,
                    "soundEnabled": settings.sound_enabled, "autoPlayExample": settings.auto_play_example})


@api.put("/settings")
@login_required
def update_settings(user):
    data = request.get_json(silent=True) or {}
    settings = UserSetting.query.filter_by(user_id=user.id).first() or UserSetting(user_id=user.id, timezone=DEFAULT_TIMEZONE)
    if "dailyNewQuota" in data:
        try:
            quota = int(data["dailyNewQuota"])
        except (TypeError, ValueError):
            return jsonify({"error": "invalid_daily_quota"}), 400
        if quota not in DAILY_QUOTAS:
            return jsonify({"error": "invalid_daily_quota", "allowed": sorted(DAILY_QUOTAS)}), 400
        settings.daily_new_quota = quota
        plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=local_today(user)).first()
        if plan:
            plan.new_quota = quota
    settings.timezone = DEFAULT_TIMEZONE
    if "soundEnabled" in data:
        settings.sound_enabled = bool(data["soundEnabled"])
    if "autoPlayExample" in data:
        settings.auto_play_example = bool(data["autoPlayExample"])
    db.session.add(settings)
    db.session.commit()
    return get_settings(user)


@api.post("/reviews")
@login_required
def submit_review_compat(user):
    """Compatibility write endpoint used by the client sync layer.

    The current study APIs own the learning-stage decision. This endpoint only
    persists the resulting FSRS card snapshot and review log for the account.
    Repeated reviewId submissions are idempotent.
    """
    data = request.get_json(silent=True) or {}
    review_id = str(data.get("reviewId", "")).strip()
    word_id = str(data.get("wordId", "")).strip()
    if not review_id or not word_id:
        return jsonify({"error": "invalid_review"}), 400
    if word_id not in selected_word_ids(user):
        return jsonify({"error": "word_not_in_selected_vocabulary"}), 409
    word = Word.query.filter_by(id=word_id).first()
    if not word:
        return jsonify({"error": "word_not_found"}), 404

    existing = ReviewLog.query.filter_by(id=review_id, user_id=user.id).first()
    if existing:
        card = UserWordCard.query.filter_by(id=existing.card_id, user_id=user.id).first()
        return jsonify({
            "review": {"id": existing.id, "reviewedAt": existing.reviewed_at.isoformat()},
            "card": card_json(card) if card else None,
            "duplicate": True,
        })

    card = UserWordCard.query.filter_by(user_id=user.id, word_id=word_id).first()
    if not card:
        card = UserWordCard(user_id=user.id, word_id=word_id, state="new", due_at=datetime.utcnow())
        db.session.add(card)
        db.session.flush()

    # Use server time as authoritative (security: prevent client time manipulation)
    reviewed_at = datetime.utcnow()
    # Allow client time only within ±5 minute window for offline scenarios
    # client_reviewed_at = parse_client_datetime(data.get("reviewedAt"), None)
    # if client_reviewed_at and abs((client_reviewed_at - reviewed_at).total_seconds()) < 300:
    #     reviewed_at = client_reviewed_at
    review_type = str(data.get("reviewType", "review"))
    try:
        rating = int(data.get("rating", 3))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid_rating"}), 400
    if rating not in {1, 2, 3, 4}:
        return jsonify({"error": "invalid_rating"}), 400

    snapshot = data.get("card") or {}
    try:
        apply_card_snapshot_monotonic(card, snapshot, reviewed_at)
    except ValueError:
        return jsonify({"error": "invalid_card"}), 400

    if card.last_review_at is None or reviewed_at > card.last_review_at:
        card.last_review_at = reviewed_at
        card.first_learned_at = card.first_learned_at or reviewed_at

    row = ReviewLog(id=review_id, user_id=user.id, word_id=word_id, card_id=card.id,
                    rating=rating, review_type=review_type, reviewed_at=reviewed_at)
    db.session.add(row)
    db.session.commit()

    return jsonify({
        "review": {"id": row.id, "reviewedAt": row.reviewed_at.isoformat()},
        "card": card_json(card),
        "duplicate": False,
    })
