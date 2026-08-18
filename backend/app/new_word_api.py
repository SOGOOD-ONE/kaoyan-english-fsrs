from datetime import date, datetime

from flask import Blueprint, jsonify

from . import db
from .api import login_required, selected_word_ids
from .models import DailyPlan, ReviewLog, UserSetting, UserWordCard, Word

new_word_api = Blueprint("new_word_api", __name__)

CATEGORY_WEIGHT = {
    "核心词": 100,
    "长难词": 95,
    "难词": 90,
    "短语": 85,
    "固定搭配": 85,
}


def word_json(word):
    return {
        "id": word.id,
        "word": word.word,
        "type": word.word_type,
        "meaning": word.meaning,
        "category": word.category,
        "source": word.source,
        "sourceDetail": word.source_detail,
    }


@new_word_api.get("/study/new-queue")
@login_required
def new_queue(user):
    today = date.today()
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    quota = int(settings.daily_new_quota if settings else 100)

    selected_ids = selected_word_ids(user)
    if not selected_ids:
        return jsonify({
            "date": today.isoformat(),
            "quota": quota,
            "completed": 0,
            "remaining": 0,
            "unlocked": False,
            "reason": "empty_vocabulary",
            "items": [],
        })

    due = UserWordCard.query.filter(
        UserWordCard.user_id == user.id,
        UserWordCard.due_at <= datetime.utcnow(),
        UserWordCard.state != "new",
        UserWordCard.word_id.in_(selected_ids),
    ).count()

    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()
    mandatory_total = plan.mandatory_total if plan else min(due, int(getattr(settings, "daily_review_quota", 100)))
    mandatory_completed = plan.mandatory_completed if plan else 0
    mandatory_remaining = max(0, mandatory_total - mandatory_completed)

    day_start = datetime.combine(today, datetime.min.time())
    new_logs = ReviewLog.query.filter(
        ReviewLog.user_id == user.id,
        ReviewLog.review_type == "new",
        ReviewLog.reviewed_at >= day_start,
    ).all()
    completed_word_ids = {log.word_id for log in new_logs}
    completed = len(completed_word_ids)
    remaining = max(0, quota - completed)

    if mandatory_remaining > 0:
        return jsonify({
            "date": today.isoformat(),
            "quota": quota,
            "completed": completed,
            "remaining": remaining,
            "unlocked": False,
            "mandatoryRemaining": mandatory_remaining,
            "items": [],
        })

    existing_cards = UserWordCard.query.filter(
        UserWordCard.user_id == user.id,
        UserWordCard.word_id.in_(selected_ids),
    ).all()
    learned_ids = {card.word_id for card in existing_cards}
    excluded_ids = learned_ids | completed_word_ids

    candidate_ids = selected_ids - excluded_ids
    candidates = Word.query.filter(Word.id.in_(candidate_ids)).all() if candidate_ids else []
    candidates.sort(key=lambda word: (-CATEGORY_WEIGHT.get(word.category, 50), word.created_at, word.id))

    items = [word_json(word) for word in candidates[:remaining]]
    return jsonify({
        "date": today.isoformat(),
        "quota": quota,
        "completed": completed,
        "remaining": remaining,
        "unlocked": True,
        "mandatoryRemaining": 0,
        "items": items,
    })
