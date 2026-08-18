from datetime import date, datetime

from flask import Blueprint, jsonify, request

from . import db
from .api import login_required
from .models import DailyPlan, StudySession, UserSetting

study_plan_api = Blueprint("study_plan_api", __name__)


def get_or_create_plan(user):
    today = date.today()
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()
    if not plan:
        quota = settings.daily_new_quota if settings else 100
        plan = DailyPlan(user_id=user.id, plan_date=today, new_quota=quota)
        db.session.add(plan)
        db.session.commit()
    return plan


@study_plan_api.get("/study/today/progress")
@login_required
def get_today_progress(user):
    plan = get_or_create_plan(user)
    active = StudySession.query.filter_by(user_id=user.id, ended_at=None).order_by(StudySession.started_at.desc()).first()
    return jsonify({
        "date": plan.plan_date.isoformat(),
        "newQuota": plan.new_quota,
        "newCompleted": plan.new_completed,
        "mandatoryTotal": plan.mandatory_total,
        "mandatoryCompleted": plan.mandatory_completed,
        "selfTotal": plan.self_total,
        "selfCompleted": plan.self_completed,
        "activeSessionId": active.id if active else None,
    })


@study_plan_api.post("/study/today/progress")
@login_required
def record_today_progress(user):
    data = request.get_json(silent=True) or {}
    mode = str(data.get("mode", "new"))
    if mode not in {"new", "mandatory", "self"}:
        return jsonify({"error": "invalid_mode"}), 400

    plan = get_or_create_plan(user)
    field = {"new": "new_completed", "mandatory": "mandatory_completed", "self": "self_completed"}[mode]
    current = int(getattr(plan, field) or 0)
    setattr(plan, field, current + 1)
    db.session.commit()
    return jsonify({"ok": True, "mode": mode, "completed": getattr(plan, field)})


@study_plan_api.post("/study/session/start")
@login_required
def start_study_session(user):
    data = request.get_json(silent=True) or {}
    mode = str(data.get("mode", "new"))
    if mode not in {"new", "mandatory", "self"}:
        return jsonify({"error": "invalid_mode"}), 400

    active = StudySession.query.filter_by(user_id=user.id, ended_at=None).order_by(StudySession.started_at.desc()).first()
    if active:
        return jsonify({"sessionId": active.id, "startedAt": active.started_at.isoformat(), "mode": active.mode})

    session = StudySession(user_id=user.id, mode=mode, started_at=datetime.utcnow())
    db.session.add(session)
    db.session.commit()
    return jsonify({"sessionId": session.id, "startedAt": session.started_at.isoformat(), "mode": session.mode})


@study_plan_api.post("/study/session/<session_id>/stop")
@login_required
def stop_study_session(user, session_id):
    session = StudySession.query.filter_by(id=session_id, user_id=user.id).first()
    if not session:
        return jsonify({"error": "session_not_found"}), 404
    if session.ended_at is None:
        ended_at = datetime.utcnow()
        session.ended_at = ended_at
        session.duration_seconds = max(0, int((ended_at - session.started_at).total_seconds()))
        db.session.commit()
    return jsonify({
        "sessionId": session.id,
        "durationSeconds": session.duration_seconds,
        "startedAt": session.started_at.isoformat(),
        "endedAt": session.ended_at.isoformat() if session.ended_at else None,
        "mode": session.mode,
    })


@study_plan_api.get("/study/time")
@login_required
def study_time(user):
    today = date.today()
    start = datetime.combine(today, datetime.min.time())
    sessions = StudySession.query.filter(
        StudySession.user_id == user.id,
        StudySession.started_at >= start,
        StudySession.ended_at.isnot(None),
    ).all()
    today_seconds = sum(int(row.duration_seconds or 0) for row in sessions)
    total_seconds = sum(int(value or 0) for value in db.session.query(db.func.sum(StudySession.duration_seconds)).filter(StudySession.user_id == user.id).all())
    active = StudySession.query.filter_by(user_id=user.id, ended_at=None).order_by(StudySession.started_at.desc()).first()
    if active:
        today_seconds += max(0, int((datetime.utcnow() - active.started_at).total_seconds()))
    return jsonify({
        "todaySeconds": today_seconds,
        "totalSeconds": total_seconds + (max(0, int((datetime.utcnow() - active.started_at).total_seconds())) if active else 0),
        "activeSessionId": active.id if active else None,
    })
