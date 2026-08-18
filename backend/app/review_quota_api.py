from datetime import datetime

from flask import Blueprint, jsonify, request

from . import db
from .api import login_required
from .models import DailyPlan, UserSetting, UserVocabulary, UserWordCard, VocabularyWord

review_quota_api = Blueprint("review_quota_api", __name__)

ALLOWED = {50, 100, 150, 200, 250, 300}


def refresh_unstarted_review_total(user, plan, quota):
    if not plan or plan.mandatory_completed != 0:
        return
    vocabulary_ids = [row.vocabulary_id for row in UserVocabulary.query.filter_by(user_id=user.id, enabled=True).all()]
    if not vocabulary_ids:
        plan.mandatory_total = 0
        return
    word_ids = {row.word_id for row in VocabularyWord.query.filter(VocabularyWord.vocabulary_id.in_(vocabulary_ids)).all()}
    if not word_ids:
        plan.mandatory_total = 0
        return
    due_count = UserWordCard.query.filter(
        UserWordCard.user_id == user.id,
        UserWordCard.word_id.in_(word_ids),
        UserWordCard.due_at <= datetime.utcnow(),
        UserWordCard.state != "new",
    ).count()
    plan.mandatory_total = min(due_count, quota)


@review_quota_api.get("/settings/review-quota")
@login_required
def get_review_quota(user):
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    return jsonify({"dailyReviewQuota": settings.daily_review_quota if settings else 100})


@review_quota_api.put("/settings/review-quota")
@login_required
def update_review_quota(user):
    data = request.get_json(silent=True) or {}
    try:
        quota = int(data.get("dailyReviewQuota"))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid_daily_review_quota", "allowed": sorted(ALLOWED)}), 400
    if quota not in ALLOWED:
        return jsonify({"error": "invalid_daily_review_quota", "allowed": sorted(ALLOWED)}), 400

    settings = UserSetting.query.filter_by(user_id=user.id).first()
    if not settings:
        settings = UserSetting(user_id=user.id, daily_new_quota=100, daily_review_quota=quota)
        db.session.add(settings)
    else:
        settings.daily_review_quota = quota

    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=db.func.current_date()).first()
    if plan:
        refresh_unstarted_review_total(user, plan, quota)

    db.session.commit()
    return jsonify({"dailyReviewQuota": quota})
