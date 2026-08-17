from datetime import date

from flask import Blueprint, jsonify, request

from . import db
from .api import login_required
from .models import DailyPlan, UserSetting

study_plan_api = Blueprint("study_plan_api", __name__)


@study_plan_api.get("/study/today/progress")
@login_required
def get_today_progress(user):
    today = date.today()
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()
    if not plan:
        plan = DailyPlan(user_id=user.id, plan_date=today, new_quota=settings.daily_new_quota if settings else 100)
        db.session.add(plan)
        db.session.commit()
    return jsonify({
        "date": today.isoformat(),
        "newQuota": plan.new_quota,
        "newCompleted": plan.new_completed,
        "mandatoryTotal": plan.mandatory_total,
        "mandatoryCompleted": plan.mandatory_completed,
        "selfTotal": plan.self_total,
        "selfCompleted": plan.self_completed,
    })


@study_plan_api.post("/study/today/progress")
@login_required
def record_today_progress(user):
    data = request.get_json(silent=True) or {}
    mode = str(data.get("mode", "new"))
    if mode not in {"new", "mandatory", "self"}:
        return jsonify({"error": "invalid_mode"}), 400

    today = date.today()
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()
    if not plan:
        plan = DailyPlan(user_id=user.id, plan_date=today, new_quota=settings.daily_new_quota if settings else 100)
        db.session.add(plan)

    field = {
        "new": "new_completed",
        "mandatory": "mandatory_completed",
        "self": "self_completed",
    }[mode]
    current = int(getattr(plan, field) or 0)
    setattr(plan, field, current + 1)
    db.session.commit()
    return jsonify({"ok": True, "mode": mode, "completed": getattr(plan, field)})
