from flask import Blueprint, jsonify

from .api import login_required, selected_word_ids
from .models import DailyPlan, UserSetting, UserWordCard, Word
from .time_utils import local_today

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
    today = local_today(user)
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    quota = int(settings.daily_review_quota if settings else 100)
    plan = DailyPlan.query.filter_by(user_id=user.id, plan_date=today).first()
    if not plan:
        return jsonify({"date": today.isoformat(), "quota": quota, "completed": 0, "remaining": 0, "words": []})

    selected_ids = selected_word_ids(user)
    remaining = max(0, plan.mandatory_total - plan.mandatory_completed)
    if not selected_ids or remaining == 0:
        return jsonify({"date": today.isoformat(), "quota": quota, "completed": plan.mandatory_completed, "remaining": remaining, "words": []})

    due_cards = (
        UserWordCard.query.filter(
            UserWordCard.user_id == user.id,
            UserWordCard.word_id.in_(selected_ids),
            UserWordCard.due_at <= __import__("datetime").datetime.utcnow(),
            UserWordCard.state != "new",
        )
        .order_by(UserWordCard.due_at.asc(), UserWordCard.last_review_at.asc(), UserWordCard.id.asc())
        .limit(remaining)
        .all()
    )
    words = Word.query.filter(Word.id.in_([card.word_id for card in due_cards])).all() if due_cards else []
    by_id = {word.id: word for word in words}

    return jsonify({
        "date": today.isoformat(),
        "quota": quota,
        "completed": plan.mandatory_completed,
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
            for card in due_cards
            if card.word_id in by_id
        ],
    })
