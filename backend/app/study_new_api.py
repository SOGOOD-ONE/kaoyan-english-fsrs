from datetime import datetime

from flask import Blueprint, jsonify

from . import db
from .api import login_required, selected_word_ids
from .models import DailyPlan, ReviewLog, UserSetting, UserWordCard, Word
from .time_utils import local_today, local_day_start_utc

study_new_api = Blueprint("study_new_api", __name__)

CATEGORY_WEIGHT = {"核心词": 100, "长难词": 95, "难词": 90, "短语": 85, "固定搭配": 85}


@study_new_api.get("/study/new-queue")
@login_required
def study_new_queue(user):
    today = local_today(user)
    settings = UserSetting.query.filter_by(user_id=user.id).first() or UserSetting(user_id=user.id)
    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()
    mandatory_total = plan.mandatory_total if plan else 0
    mandatory_completed = plan.mandatory_completed if plan else 0
    mandatory_remaining = max(0, mandatory_total - mandatory_completed)
    if mandatory_remaining > 0:
        return jsonify({
            "date": today.isoformat(),
            "newUnlocked": False,
            "mandatoryRemaining": mandatory_remaining,
            "quota": settings.daily_new_quota,
            "effectiveQuota": 0,
            "available": 0,
            "completed": 0,
            "words": [],
        })

    day_start = local_day_start_utc(user, today)
    new_logs = ReviewLog.query.filter(
        ReviewLog.user_id == user.id,
        ReviewLog.reviewed_at >= day_start,
        ReviewLog.review_type == "new",
    ).all()
    served_ids = {row.word_id for row in new_logs}
    completed = len(served_ids)

    selected_ids = selected_word_ids(user)
    learned_ids = {
        row.word_id
        for row in UserWordCard.query.filter(
            UserWordCard.user_id == user.id,
            (UserWordCard.review_count > 0) | (UserWordCard.first_learned_at.isnot(None)),
        ).all()
    }
    candidate_ids = selected_ids - learned_ids - served_ids
    available = len(candidate_ids)
    effective_quota = min(int(settings.daily_new_quota), available + completed)
    remaining = max(0, effective_quota - completed)

    if remaining == 0:
        return jsonify({
            "date": today.isoformat(),
            "newUnlocked": True,
            "mandatoryRemaining": 0,
            "quota": settings.daily_new_quota,
            "effectiveQuota": effective_quota,
            "available": available,
            "completed": completed,
            "words": [],
        })

    query = Word.query.filter(Word.id.in_(candidate_ids)) if candidate_ids else Word.query.filter(False)
    candidates = query.all()
    candidates.sort(key=lambda word: (-CATEGORY_WEIGHT.get(word.category, 50), word.created_at, word.id))
    words = [
        {"id": word.id, "word": word.word, "type": word.word_type, "meaning": word.meaning,
         "category": word.category, "source": word.source}
        for word in candidates[:remaining]
    ]
    db.session.commit()
    return jsonify({
        "date": today.isoformat(),
        "newUnlocked": True,
        "mandatoryRemaining": 0,
        "quota": settings.daily_new_quota,
        "effectiveQuota": effective_quota,
        "available": available,
        "completed": completed,
        "words": words,
    })
