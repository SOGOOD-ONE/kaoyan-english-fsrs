from datetime import datetime

from flask import Blueprint, jsonify

from . import db
from .api import login_required, selected_word_ids
from .models import DailyPlan, UserSetting, UserWordCard, Word

review_queue_api = Blueprint("review_queue_api", __name__)


def card_json(card):
    return {
        "id": card.id,
        "wordId": card.word_id,
        "state": card.state,
        "stability": card.stability,
        "difficulty": card.difficulty,
        "dueAt": card.due_at.isoformat(),
        "firstLearnedAt": card.first_learned_at.isoformat() if card.first_learned_at else None,
        "lastReviewAt": card.last_review_at.isoformat() if card.last_review_at else None,
        "correctCount": card.correct_count,
        "wrongCount": card.wrong_count,
        "reviewCount": card.review_count,
    }


@review_queue_api.get("/study/review-queue")
@login_required
def review_queue(user):
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    quota = int(settings.daily_review_quota if settings else 100)
    plan = DailyPlan.query.filter_by(user_id=user.id).filter(
        DailyPlan.plan_date == db.func.current_date()
    ).first()

    selected_ids = selected_word_ids(user)
    if not selected_ids:
        return jsonify({
            "quota": quota,
            "completed": int(plan.mandatory_completed if plan else 0),
            "remaining": 0,
            "words": [],
        })

    query = UserWordCard.query.filter(
        UserWordCard.user_id == user.id,
        UserWordCard.word_id.in_(selected_ids),
        UserWordCard.due_at <= datetime.utcnow(),
        UserWordCard.state != "new",
    )
    due_cards = query.order_by(UserWordCard.due_at.asc(), UserWordCard.id.asc()).all()
    completed = int(plan.mandatory_completed if plan else 0)
    remaining = max(0, min(quota, len(due_cards)) - completed)

    queue = due_cards[:max(0, min(quota, len(due_cards)))]
    words = Word.query.filter(Word.id.in_([card.word_id for card in queue])).all() if queue else []
    by_id = {word.id: word for word in words}

    return jsonify({
        "quota": quota,
        "completed": completed,
        "remaining": remaining,
        "words": [
            {
                "id": by_id[card.word_id].id,
                "word": by_id[card.word_id].word,
                "type": by_id[card.word_id].word_type,
                "meaning": by_id[card.word_id].meaning,
                "category": by_id[card.word_id].category,
                "source": by_id[card.word_id].source,
                "card": card_json(card),
            }
            for card in queue
            if card.word_id in by_id
        ],
    })
