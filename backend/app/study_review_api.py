from datetime import datetime

from flask import Blueprint, jsonify

from . import db
from .api import login_required, selected_word_ids
from .models import DailyPlan, UserSetting, UserWordCard, Word
from .time_utils import local_today

study_review_api = Blueprint("study_review_api", __name__)


@study_review_api.get("/study/review-queue")
@login_required
def study_review_queue(user):
    today = local_today(user)
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    review_quota = settings.daily_review_quota if settings else 100
    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()
    if not plan:
        return jsonify({"date": today.isoformat(), "quota": review_quota, "completed": 0, "remaining": 0, "words": []})

    remaining = max(0, plan.mandatory_total - plan.mandatory_completed)
    if remaining == 0:
        return jsonify({"date": today.isoformat(), "quota": review_quota, "completed": plan.mandatory_completed, "remaining": 0, "words": []})

    selected_ids = selected_word_ids(user)
    query = UserWordCard.query.filter(
        UserWordCard.user_id == user.id,
        UserWordCard.due_at <= datetime.utcnow(),
        UserWordCard.state != "new",
    )
    if selected_ids:
        query = query.filter(UserWordCard.word_id.in_(selected_ids))
    else:
        query = query.filter(False)

    cards = query.order_by(UserWordCard.due_at.asc(), UserWordCard.last_review_at.asc(), UserWordCard.word_id.asc()).limit(remaining).all()
    words = []
    for card in cards:
        word = Word.query.filter_by(id=card.word_id).first()
        if not word:
            continue
        words.append({
            "id": word.id,
            "word": word.word,
            "type": word.word_type,
            "meaning": word.meaning,
            "category": word.category,
            "source": word.source,
            "card": {
                "id": card.id,
                "wordId": card.word_id,
                "state": card.state,
                "stability": card.stability,
                "difficulty": card.difficulty,
                "dueAt": card.due_at.isoformat(),
                "reviewCount": card.review_count,
            },
        })
    return jsonify({
        "date": today.isoformat(),
        "quota": review_quota,
        "completed": plan.mandatory_completed,
        "remaining": remaining,
        "words": words,
    })
