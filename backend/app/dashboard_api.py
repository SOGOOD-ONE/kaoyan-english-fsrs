from datetime import datetime

from flask import Blueprint, jsonify

from .api import login_required, selected_word_ids
from .history import build_history
from .models import DailyPlan, ReviewLog, StudySession, UserSetting, UserWordCard
from .study_plan_api import card_retrievability, get_or_create_plan


dashboard_api = Blueprint("dashboard_api", __name__)


def build_overview(user):
    word_ids = selected_word_ids(user)
    total = len(word_ids)
    if not word_ids:
        return {
            "totalWords": 0, "learnedWords": 0, "reviewedWords": 0,
            "masteredWords": 0, "remainingWords": 0, "progressPercent": 0.0,
        }

    cards = UserWordCard.query.filter(
        UserWordCard.user_id == user.id,
        UserWordCard.word_id.in_(word_ids),
    ).all()
    logs = ReviewLog.query.filter(
        ReviewLog.user_id == user.id,
        ReviewLog.word_id.in_(word_ids),
    ).all()

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
        if not card:
            continue
        if (
            card.state == "review"
            and card.review_count >= 2
            and card.stability >= 1.5
            and card_retrievability(card) >= 0.9
            and card.correct_count >= card.wrong_count
        ):
            mastered_ids.add(word_id)

    learned = len(learned_ids)
    reviewed = len(reviewed_ids)
    mastered = len(mastered_ids)
    remaining = max(0, total - learned)
    return {
        "totalWords": total,
        "learnedWords": learned,
        "reviewedWords": reviewed,
        "masteredWords": mastered,
        "remainingWords": remaining,
        "progressPercent": round((learned / total) * 100, 1) if total else 0.0,
    }


@dashboard_api.get("/study/dashboard-summary")
@login_required
def dashboard_summary(user):
    overview = build_overview(user)
    plan = get_or_create_plan(user)
    now = datetime.utcnow()
    active = StudySession.query.filter_by(
        user_id=user.id, ended_at=None
    ).order_by(StudySession.started_at.desc()).first()
    sessions = StudySession.query.filter(
        StudySession.user_id == user.id,
        StudySession.started_at >= now.replace(hour=0, minute=0, second=0, microsecond=0),
        StudySession.ended_at.isnot(None),
    ).all()
    today_seconds = sum(int(row.duration_seconds or 0) for row in sessions)
    total_seconds = db.session.query(
        db.func.coalesce(db.func.sum(StudySession.duration_seconds), 0)
    ).filter(StudySession.user_id == user.id).scalar() or 0
    total_seconds = int(total_seconds)
    if active:
        elapsed = max(0, int((now - active.started_at).total_seconds()))
        today_seconds += elapsed
        total_seconds += elapsed

    history = build_history(user.id, 3650)
    mandatory_completed = min(plan.mandatory_completed, plan.mandatory_total)
    review_remaining = max(0, plan.mandatory_total - plan.mandatory_completed)
    return jsonify({
        "overview": overview,
        "time": {
            "todaySeconds": today_seconds,
            "totalSeconds": total_seconds,
            "activeSessionId": active.id if active else None,
        },
        "today": {
            "mandatoryTotal": plan.mandatory_total,
            "mandatoryCompleted": mandatory_completed,
            "selfTotal": plan.self_total,
            "selfCompleted": plan.self_completed,
            "newQuota": plan.new_quota,
            "newCompleted": plan.new_completed,
            "reviewRemaining": review_remaining,
        },
        "activeDays": history["activeDays"],
    })
