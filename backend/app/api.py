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
