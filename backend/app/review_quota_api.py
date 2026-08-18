from flask import Blueprint, jsonify, request

from . import db
from .api import login_required
from .models import DailyPlan, UserSetting
from .time_utils import local_today

review_quota_api = Blueprint("review_quota_api", __name__)

ALLOWED = {50, 100, 150, 200, 250, 300}


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

    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=local_today(user)).first()
    if plan:
        plan.self_total = quota
        if plan.self_completed > plan.self_total:
            plan.self_completed = plan.self_total

    db.session.commit()
    return jsonify({"dailyReviewQuota": quota})
