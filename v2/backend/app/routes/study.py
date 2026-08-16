from datetime import datetime, timedelta, timezone

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import and_, not_, or_

from .. import db
from ..models import DailyPlan, ReviewLog, UserCard, UserSettings, Word, VocabularyWord
from ..scheduler.engine import StudyScheduler

bp = Blueprint("study", __name__)
scheduler = StudyScheduler()


def day_bounds(now=None):
    # V2 currently uses the user's configured local timezone as a later API concern;
    # UTC-naive timestamps are stored consistently in the first implementation.
    now = now or datetime.utcnow()
    start = datetime(now.year, now.month, now.day)
    return start, start + timedelta(days=1)


def get_or_create_plan(user_id, today):
    plan = DailyPlan.query.filter_by(user_id=user_id, plan_date=today).first()
    settings = UserSettings.query.get(user_id)
    quota = settings.daily_new_quota if settings else 100
    if not plan:
        plan = DailyPlan(user_id=user_id, plan_date=today, new_quota=quota)
        db.session.add(plan)
        db.session.flush()
    elif plan.new_quota != quota and plan.new_completed == 0:
        plan.new_quota = quota
    return plan


def card_json(card, word):
    return {"word_id": word.id, "word": word.word, "meaning": word.meaning, "card": None if not card else {"state": card.state, "stability": card.stability, "difficulty": card.difficulty, "due_at": card.due_at.isoformat(), "correct_count": card.correct_count, "wrong_count": card.wrong_count}}


@bp.get("/dashboard")
@jwt_required()
def dashboard():
    user_id = get_jwt_identity()
    today, tomorrow = day_bounds()
    yesterday = today - timedelta(days=1)
    plan = get_or_create_plan(user_id, today)
    mandatory = UserCard.query.filter(UserCard.user_id == user_id, UserCard.first_learned_at >= yesterday, UserCard.first_learned_at < today).count()
    mandatory_done = ReviewLog.query.filter(ReviewLog.user_id == user_id, ReviewLog.review_type == "mandatory", ReviewLog.reviewed_at >= today, ReviewLog.reviewed_at < tomorrow).count()
    self_due = UserCard.query.filter(UserCard.user_id == user_id, UserCard.state.in_(["learning", "review"]), UserCard.due_at <= datetime.utcnow()).count()
    new_done = plan.new_completed
    return {"new_quota": plan.new_quota, "new_completed": new_done, "mandatory_total": mandatory, "mandatory_completed": mandatory_done, "self_due": self_due}


@bp.get("/queue/<mode>")
@jwt_required()
def queue(mode):
    user_id = get_jwt_identity()
    limit = min(max(int(request.args.get("limit", 100)), 1), 500)
    today, tomorrow = day_bounds()
    if mode == "new":
        plan = get_or_create_plan(user_id, today)
        remaining = max(0, plan.new_quota - plan.new_completed)
        limit = min(limit, remaining)
        learned = db.session.query(UserCard.word_id).filter(UserCard.user_id == user_id).subquery()
        rows = Word.query.filter(~Word.id.in_(learned)).limit(limit).all()
        return [card_json(None, w) for w in rows]
    if mode == "mandatory":
        yesterday = today - timedelta(days=1)
        reviewed = db.session.query(ReviewLog.word_id).filter(ReviewLog.user_id == user_id, ReviewLog.review_type == "mandatory", ReviewLog.reviewed_at >= today, ReviewLog.reviewed_at < tomorrow).subquery()
        rows = (db.session.query(UserCard, Word).join(Word, Word.id == UserCard.word_id).filter(UserCard.user_id == user_id, UserCard.first_learned_at >= yesterday, UserCard.first_learned_at < today, ~UserCard.word_id.in_(reviewed)).limit(limit).all())
        return [card_json(c, w) for c, w in rows]
    if mode == "self":
        rows = (db.session.query(UserCard, Word).join(Word, Word.id == UserCard.word_id).filter(UserCard.user_id == user_id, UserCard.state.in_(["learning", "review"]), UserCard.due_at <= datetime.utcnow()).order_by(UserCard.due_at.asc()).limit(limit).all())
        return [card_json(c, w) for c, w in rows]
    return {"message": "mode 必须是 new、mandatory 或 self"}, 400


@bp.post("/review")
@jwt_required()
def review():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    word_id = data.get("word_id")
    rating = int(data.get("rating", 3))
    review_type = data.get("review_type", "self")
    word = Word.query.get(word_id)
    if not word:
        return {"message": "词条不存在"}, 404
    card = UserCard.query.filter_by(user_id=user_id, word_id=word_id).first()
    now = datetime.utcnow()
    if not card:
        card = UserCard(user_id=user_id, word_id=word_id, state="new", stability=1.0, difficulty=5.0, due_at=now)
        db.session.add(card)
        db.session.flush()
    before = (card.state, card.stability, card.difficulty)
    elapsed = 0.0 if not card.last_review_at else max(0.0, (now - card.last_review_at).total_seconds() / 86400)
    result = scheduler.review(state=card.state, stability=card.stability, difficulty=card.difficulty, rating=rating, now=now, elapsed_days=elapsed)
    if not card.first_learned_at:
        card.first_learned_at = now
    card.state = result.state
    card.stability = result.stability
    card.difficulty = result.difficulty
    card.due_at = result.due_at
    card.last_review_at = now
    card.review_count += 1
    if rating >= 3:
        card.correct_count += 1
    else:
        card.wrong_count += 1
    db.session.add(ReviewLog(user_id=user_id, word_id=word_id, card_id=card.id, rating=rating, review_type=review_type, reviewed_at=now, state_before=before[0], state_after=result.state, stability_before=before[1], stability_after=result.stability, difficulty_before=before[2], difficulty_after=result.difficulty))
    if review_type == "new":
        today = now.date()
        plan = get_or_create_plan(user_id, today)
        plan.new_completed += 1
    db.session.commit()
    return card_json(card, word)
