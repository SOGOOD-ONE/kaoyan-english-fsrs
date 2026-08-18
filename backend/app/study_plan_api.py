from datetime import date, datetime

from flask import Blueprint, jsonify, request

from . import db
from .api import login_required, selected_word_ids
from .models import DailyPlan, StudySession, UserSetting, UserWordCard, ReviewLog

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


def card_retrievability(card, now=None):
    if card.state != "review" or not card.last_review_at or card.stability <= 0:
        return 0.0
    now = now or datetime.utcnow()
    elapsed_days = max(0.0, (now - card.last_review_at).total_seconds() / 86400.0)
    return 0.9 ** (elapsed_days / max(float(card.stability), 1e-6))


def today_due_cards(user):
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
    return query.order_by(UserWordCard.due_at.asc()).all()


@study_plan_api.get("/study/overview")
@login_required
def study_overview(user):
    word_ids = selected_word_ids(user)
    total = len(word_ids)
    cards = UserWordCard.query.filter(UserWordCard.user_id == user.id, UserWordCard.word_id.in_(word_ids)).all() if word_ids else []
    learned_ids = {card.word_id for card in cards if card.first_learned_at is not None or card.review_count > 0}
    reviewed_ids = {card.word_id for card in cards if card.review_count > 1}
    mastered_ids = {card.word_id for card in cards if card.state == "review" and card.stability >= 1.5 and card_retrievability(card) >= 0.9 and card.review_count >= 2}
    learned, reviewed, mastered = len(learned_ids), len(reviewed_ids), len(mastered_ids)
    remaining = max(0, total - learned)
    return jsonify({"totalWords": total, "learnedWords": learned, "reviewedWords": reviewed, "masteredWords": mastered, "remainingWords": remaining, "progressPercent": round((learned / total) * 100, 1) if total else 0.0})


@study_plan_api.get("/study/today/progress")
@login_required
def get_today_progress(user):
    plan = get_or_create_plan(user)
    due = today_due_cards(user)
    # Snapshot the amount of mandatory review when the day is first established.
    # Once set, it does not shrink as cards are reviewed.
    if plan.mandatory_total == 0 and plan.mandatory_completed == 0 and due:
        plan.mandatory_total = len(due)
        db.session.commit()
    active = StudySession.query.filter_by(user_id=user.id, ended_at=None).order_by(StudySession.started_at.desc()).first()
    return jsonify({
        "date": plan.plan_date.isoformat(),
        "newQuota": plan.new_quota,
        "newCompleted": plan.new_completed,
        "mandatoryTotal": plan.mandatory_total,
        "mandatoryCompleted": min(plan.mandatory_completed, plan.mandatory_total),
        "selfTotal": plan.self_total,
        "selfCompleted": plan.self_completed,
        "activeSessionId": active.id if active else None,
        "reviewRemaining": max(0, plan.mandatory_total - plan.mandatory_completed),
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
    setattr(plan, field, int(getattr(plan, field) or 0) + 1)
    if mode == "mandatory":
        plan.mandatory_completed = min(plan.mandatory_completed, plan.mandatory_total)
    db.session.commit()
    return jsonify({"ok": True, "mode": mode, "completed": getattr(plan, field), "reviewRemaining": max(0, plan.mandatory_total - plan.mandatory_completed)})


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
    return jsonify({"sessionId": session.id, "durationSeconds": session.duration_seconds, "startedAt": session.started_at.isoformat(), "endedAt": session.ended_at.isoformat() if session.ended_at else None, "mode": session.mode})


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
    total_seconds = db.session.query(
        db.func.coalesce(db.func.sum(StudySession.duration_seconds), 0)
    ).filter(StudySession.user_id == user.id).scalar() or 0
    total_seconds = int(total_seconds)

    active = StudySession.query.filter_by(user_id=user.id, ended_at=None).order_by(StudySession.started_at.desc()).first()
    if active:
        elapsed = max(0, int((datetime.utcnow() - active.started_at).total_seconds()))
        today_seconds += elapsed
        total_seconds += elapsed

    return jsonify({"todaySeconds": today_seconds, "totalSeconds": total_seconds, "activeSessionId": active.id if active else None})


@study_plan_api.post("/study/reset")
@login_required
def reset_study_progress(user):
    ReviewLog.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    UserWordCard.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    DailyPlan.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    StudySession.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    db.session.commit()
    return jsonify({"ok": True})
