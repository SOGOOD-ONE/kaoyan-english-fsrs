from datetime import datetime

from flask import Blueprint, jsonify, request

from . import db
from .api import login_required, selected_word_ids
from .models import DailyPlan, StudySession, UserSetting, UserWordCard, ReviewLog
from .time_utils import local_today, local_day_start_utc, local_day_end_utc, mandatory_source_date

study_plan_api = Blueprint("study_plan_api", __name__)


def today_due_cards(user):
    selected_ids = selected_word_ids(user)
    query = UserWordCard.query.filter(
        UserWordCard.user_id == user.id,
        UserWordCard.due_at <= datetime.utcnow(),
        UserWordCard.state != "new",
        UserWordCard.known_excluded.is_(False),
    )
    if selected_ids:
        query = query.filter(UserWordCard.word_id.in_(selected_ids))
    else:
        query = query.filter(False)
    return query.order_by(UserWordCard.due_at.asc()).all()


def mandatory_word_ids(user, source_date=None):
    source_date = source_date or mandatory_source_date(user)
    start = local_day_start_utc(user, source_date)
    end = local_day_end_utc(user, source_date)
    rows = ReviewLog.query.filter(
        ReviewLog.user_id == user.id,
        ReviewLog.review_type == "new",
        ReviewLog.reviewed_at >= start,
        ReviewLog.reviewed_at <= end,
    ).all()
    ids = {row.word_id for row in rows}
    if not ids:
        return set(), source_date
    excluded = {
        row.word_id for row in UserWordCard.query.filter(
            UserWordCard.user_id == user.id,
            UserWordCard.word_id.in_(ids),
            UserWordCard.known_excluded.is_(True),
        ).all()
    }
    return ids - excluded, source_date


def get_or_create_plan(user):
    today = local_today(user)
    source_date = mandatory_source_date(user)
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    new_quota = settings.daily_new_quota if settings else 100
    self_quota = settings.daily_review_quota if settings else 100
    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()
    source_ids, source_date = mandatory_word_ids(user, source_date)
    source_total = len(source_ids)
    if not plan:
        plan = DailyPlan(
            user_id=user.id,
            plan_date=today,
            new_quota=new_quota,
            mandatory_total=source_total,
            mandatory_completed=0,
            mandatory_source_date=source_date,
            self_total=self_quota,
            self_completed=0,
        )
        db.session.add(plan)
        db.session.commit()
    elif plan.mandatory_source_date != source_date:
        plan.mandatory_source_date = source_date
        plan.mandatory_total = source_total
        plan.mandatory_completed = 0
        plan.self_total = self_quota
        plan.self_completed = 0
        plan.new_quota = new_quota
        db.session.commit()
    else:
        plan.mandatory_total = source_total
        plan.new_quota = new_quota
        plan.self_total = self_quota
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
    learned_ids = {word_id for word_id in learned_ids if not card_by_word.get(word_id, None) or not card_by_word[word_id].known_excluded}
    reviewed_ids = {word_id for word_id, count in reviews_by_word.items() if count >= 2}
    reviewed_ids.update(card.word_id for card in cards if card.review_count >= 2 and not card.known_excluded)

    mastered_ids = set()
    for word_id in reviewed_ids:
        card = card_by_word.get(word_id)
        if card and not card.known_excluded and card.state == "review" and card.review_count >= 2 and card.stability >= 1.5 and card_retrievability(card) >= 0.9 and card.correct_count >= card.wrong_count:
            mastered_ids.add(word_id)

    learned, reviewed, mastered = len(learned_ids), len(reviewed_ids), len(mastered_ids)
    remaining = max(0, total - learned - len({c.word_id for c in cards if c.known_excluded}))
    return jsonify({"totalWords": total, "learnedWords": learned, "reviewedWords": reviewed, "masteredWords": mastered, "remainingWords": remaining, "progressPercent": round((learned / total) * 100, 1) if total else 0.0})


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
        "mandatoryCompleted": min(plan.mandatory_completed, plan.mandatory_total),
        "mandatorySourceDate": plan.mandatory_source_date.isoformat() if plan.mandatory_source_date else None,
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
    if mode == "self":
        settings = UserSetting.query.filter_by(user_id=user.id).first()
        plan.self_total = settings.daily_review_quota if settings else plan.self_total
        plan.self_completed = min(plan.self_completed, plan.self_total)
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
