from datetime import datetime

from flask import Blueprint, jsonify, request

from . import db
from .api import login_required, selected_word_ids
from .models import DailyPlan, ReviewLog, UserSetting, UserWordCard, Word
from .time_utils import local_today, local_day_start_utc

study_new_api = Blueprint("study_new_api", __name__)

CATEGORY_WEIGHT = {"核心词": 100, "长难词": 95, "难词": 90, "短语": 85, "固定搭配": 85}


def word_json(word):
    return {"id": word.id, "word": word.word, "type": word.word_type, "meaning": word.meaning, "category": word.category, "source": word.source}


def card_json(card):
    return {
        "id": card.id,
        "wordId": card.word_id,
        "newEcCorrect": card.new_ec_correct,
        "newCeCorrect": card.new_ce_correct,
        "knownExcluded": bool(card.known_excluded),
        "newComplete": card.new_ec_correct >= 2 and card.new_ce_correct >= 1,
    }


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
        return jsonify({"date": today.isoformat(), "newUnlocked": False, "mandatoryRemaining": mandatory_remaining, "quota": settings.daily_new_quota, "effectiveQuota": 0, "available": 0, "completed": plan.new_completed if plan else 0, "words": []})

    day_start = local_day_start_utc(user, today)
    completed = ReviewLog.query.filter(ReviewLog.user_id == user.id, ReviewLog.reviewed_at >= day_start, ReviewLog.review_type == "new").with_entities(ReviewLog.word_id).distinct().count()
    selected_ids = selected_word_ids(user)
    cards = UserWordCard.query.filter(UserWordCard.user_id == user.id, UserWordCard.word_id.in_(selected_ids)).all() if selected_ids else []
    learned_ids = {c.word_id for c in cards if not c.known_excluded and c.review_count > 0}
    known_ids = {c.word_id for c in cards if c.known_excluded}
    completed_ids = {row[0] for row in ReviewLog.query.filter(ReviewLog.user_id == user.id, ReviewLog.reviewed_at >= day_start, ReviewLog.review_type == "new").with_entities(ReviewLog.word_id).distinct().all()}
    candidate_ids = selected_ids - learned_ids - known_ids - completed_ids
    available = len(candidate_ids)
    effective_quota = min(int(settings.daily_new_quota), available + completed)
    remaining = max(0, effective_quota - completed)
    if remaining == 0:
        return jsonify({"date": today.isoformat(), "newUnlocked": True, "mandatoryRemaining": 0, "quota": settings.daily_new_quota, "effectiveQuota": effective_quota, "available": available, "completed": completed, "words": []})

    query = Word.query.filter(Word.id.in_(candidate_ids)) if candidate_ids else Word.query.filter(False)
    candidates = query.all()
    candidates.sort(key=lambda word: (-CATEGORY_WEIGHT.get(word.category, 50), word.created_at, word.id))
    card_map = {c.word_id: c for c in cards}
    words = []
    for word in candidates[:remaining]:
        words.append({**word_json(word), "card": card_json(card_map[word.id]) if word.id in card_map else {"newEcCorrect": 0, "newCeCorrect": 0, "knownExcluded": False, "newComplete": False}})
    return jsonify({"date": today.isoformat(), "newUnlocked": True, "mandatoryRemaining": 0, "quota": settings.daily_new_quota, "effectiveQuota": effective_quota, "available": available, "completed": completed, "words": words})


@study_new_api.post("/study/new-answer")
@login_required
def answer_new_word(user):
    data = request.get_json(silent=True) or {}
    word_id = str(data.get("wordId", ""))
    direction = str(data.get("direction", ""))
    correct = bool(data.get("correct", False))
    if not word_id or direction not in {"ec", "ce"}:
        return jsonify({"error": "invalid_new_answer"}), 400
    word = Word.query.filter_by(id=word_id).first()
    if not word:
        return jsonify({"error": "word_not_found"}), 404
    if word_id not in selected_word_ids(user):
        return jsonify({"error": "word_not_in_selected_vocabulary"}), 409
    card = UserWordCard.query.filter_by(user_id=user.id, word_id=word_id).first()
    if not card:
        card = UserWordCard(user_id=user.id, word_id=word_id, state="new", due_at=datetime.utcnow())
        db.session.add(card)
        db.session.flush()
    if card.known_excluded:
        return jsonify({"error": "word_excluded"}), 409
    expected_direction = "ce" if card.new_ec_correct >= 2 else "ec"
    if direction != expected_direction:
        return jsonify({"error": "wrong_learning_stage", "expectedDirection": expected_direction, "card": card_json(card)}), 409
    if correct:
        if direction == "ec":
            card.new_ec_correct = min(2, card.new_ec_correct + 1)
        else:
            card.new_ce_correct = min(1, card.new_ce_correct + 1)
    completed = card.new_ec_correct >= 2 and card.new_ce_correct >= 1
    if completed:
        card.first_learned_at = card.first_learned_at or datetime.utcnow()
    db.session.commit()
    return jsonify({"ok": True, "correct": correct, "expectedDirection": "ce" if card.new_ec_correct >= 2 else "ec", "completed": completed, "card": card_json(card)})


@study_new_api.post("/study/known-exclude")
@login_required
def mark_known_excluded(user):
    data = request.get_json(silent=True) or {}
    word_id = str(data.get("wordId", ""))
    mode = str(data.get("mode", "new"))
    if mode not in {"new", "mandatory", "self"}:
        return jsonify({"error": "invalid_mode"}), 400
    if not word_id or not Word.query.filter_by(id=word_id).first():
        return jsonify({"error": "word_not_found"}), 404
    if word_id not in selected_word_ids(user):
        return jsonify({"error": "word_not_in_selected_vocabulary"}), 409
    card = UserWordCard.query.filter_by(user_id=user.id, word_id=word_id).first()
    if not card:
        card = UserWordCard(user_id=user.id, word_id=word_id, state="new", due_at=datetime.utcnow())
        db.session.add(card)
    card.known_excluded = True
    card.new_ec_correct = 0
    card.new_ce_correct = 0
    today = local_today(user)
    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()
    if plan:
        if mode == "new":
            plan.new_completed = min(plan.new_quota, plan.new_completed + 1)
        elif mode == "mandatory":
            plan.mandatory_completed = min(plan.mandatory_total, plan.mandatory_completed + 1)
        else:
            plan.self_completed += 1
    db.session.commit()
    return jsonify({"ok": True, "wordId": word_id, "knownExcluded": True, "mode": mode})


@study_new_api.post("/study/new-known")
@login_required
def mark_new_known_compat(user):
    data = request.get_json(silent=True) or {}
    data["mode"] = "new"
    request._cached_json = (data, data)
    return mark_known_excluded(user)
