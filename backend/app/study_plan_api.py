from datetime import datetime

from flask import Blueprint, jsonify, request

from . import db
from .api import login_required, selected_word_ids
from .models import DailyPlan, StudySession, UserSetting, UserWordCard, ReviewLog
from .time_utils import local_today, local_day_start_utc, user_timezone

study_plan_api = Blueprint("study_plan_api", __name__)


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


def get_or_create_plan(user):
    today = local_today(user)
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    quota = settings.daily_new_quota if settings else 100
    review_quota = settings.daily_review_quota if settings else 100
    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()
    if not plan:
        due = today_due_cards(user)
        plan = DailyPlan(user_id=user.id, plan_date=today, new_quota=quota, mandatory_total=min(len(due), review_quota), mandatory_completed=0)
        db.session.add(plan)
        db.session.commit()
    elif plan.mandatory_completed == 0:
        due_count = len(today_due_cards(user))
        expected_total = min(due_count, review_quota)
        if expected_total != plan.mandatory_total:
            plan.mandatory_total = expected_total
            db.session.commit()
    return plan


def card_retrievability(card, now=None):
    if card.state != "review" or not card.last_review_at or card.stability <= 0:
        return 0.0
    now = now or datetime.utcnow()
    elapsed_days = max(0.0, (now - card.last_review_at).total_seconds() / 86400.0)
    return 0.9 ** (elapsed_days / max(float(card.stability), 1e-6))


@study_plan_api.get("/study/overview")
@login_required
def study_overview(user):
    word_ids = selected_word_ids(user)
    total = len(word_ids)
    if not word_ids:
        return jsonify({"totalWords": 0, "learnedWords": 0, "reviewedWords": 0, "masteredWords": 0, "remainingWords": 0, "progressPercent": 0.0})

    cards = UserWordCard.query.filter(UserWordCard.user_id == user.id, UserWordCard.word_id.in_(word_ids)).all()
    logs = ReviewLog.query.filter(ReviewLog.user_id == user.id, ReviewLog.word_id.in_(word_ids)).all()
    reviews_by_word = {}
    for log in logs:
        reviews_by_word[log.word_id] = reviews_by_word.get(log.word_id, 0) + 1

    card_by_word = {card.word_id: card for card in cards}
    learned_ids = {word_id for word_id, count in reviews_by_word.items() if count > 0}
    learned_ids.update(card.word_id for card in cards if card.first_learned_at is not None)
    reviewed_ids = {word_id for word_id, count in reviews_by_word.items() if count >= 2}
    reviewed_ids.update(card.word_id for card in cards if card.review_count >= 2)

    mastered_ids = set()
    for word_id in reviewed_ids:
        card = card_by_word.get(word_id)
        if card and card.state == "review" and card.review_count >= 2 and card.stability >= 1.5 and card_retrievability(card) >= 0.9 and card.correct_count >= card.wrong_count:
            mastered_ids.add(word_id)

    learned, reviewed, mastered = len(learned_ids), len(reviewed_ids), len(mastered_ids)
    remaining = max(0, total - learned)
    return jsonify({"totalWords": total, "learnedWords": learned, "reviewedWords": reviewed, "masteredWords": mastered, "remainingWords": remaining, "progressPercent": round((learned / total) * 100, 1) if total else 0.0})


@study_plan_api.get("/study/today/progress")
@login_required
def get_today_progress(user):
    plan = get_or_create_plan(user)
    active = StudySession.query.filter_by(user_id=user.id, ended_at=None).order_by(StudySession.started_at.desc()).first()
    return jsonify({"date": plan.plan_date.isoformat(), "newQuota": plan.new_quota, "newCompleted": plan.new_completed, "mandatoryTotal": plan.mandatory_total, "mandatoryCompleted": min(plan.mandatory_completed, plan.mandatory_total), "selfTotal": plan.self_total, "selfCompleted": plan.self_completed, "activeSessionId": active.id if active else None, "reviewRemaining": max(0, plan.mandatory_total - plan.mandatory_completed)})


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

    now = datetime.utcnow()
    active_sessions = StudySession.query.filter_by(user_id=user.id, ended_at=None).all()
    for active in active_sessions:
        active.ended_at = now
        active.duration_seconds = max(0, int((now - active.started_at).total_seconds()))
    session = StudySession(user_id=user.id, mode=mode, started_at=now)
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
    today = local_today(user)
    start = local_day_start_utc(user, today)
    sessions = StudySession.query.filter(StudySession.user_id == user.id, StudySession.started_at >= start, StudySession.ended_at.isnot(None)).all()
    today_seconds = sum(int(row.duration_seconds or 0) for row in sessions)
    total_seconds = int(db.session.query(db.func.coalesce(db.func.sum(StudySession.duration_seconds), 0)).filter(StudySession.user_id == user.id).scalar() or 0)
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
