from flask import Blueprint, jsonify

from .api import login_required
from .models import UserWordCard, Word
from .study_plan_api import get_or_create_plan, mandatory_word_ids
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
    plan = get_or_create_plan(user)
    source_ids, source_date = mandatory_word_ids(user, plan.mandatory_source_date)
    remaining = max(0, len(source_ids) - plan.mandatory_completed)
    if not source_ids or remaining == 0:
        return jsonify({
            "date": today.isoformat(),
            "sourceDate": source_date.isoformat(),
            "refreshHour": 6,
            "quota": None,
            "completed": plan.mandatory_completed,
            "remaining": remaining,
            "words": [],
        })

    cards = UserWordCard.query.filter(
        UserWordCard.user_id == user.id,
        UserWordCard.word_id.in_(source_ids),
        UserWordCard.known_excluded.is_(False),
    ).order_by(UserWordCard.last_review_at.asc(), UserWordCard.id.asc()).all()
    by_id = {word.id: word for word in Word.query.filter(Word.id.in_([c.word_id for c in cards])).all()} if cards else {}
    words = [
        {
            "id": by_id[card.word_id].id,
            "word": by_id[card.word_id].word,
            "type": by_id[card.word_id].word_type,
            "meaning": by_id[card.word_id].meaning,
            "category": by_id[card.word_id].category,
            "source": by_id[card.word_id].source,
            "card": card_json(card),
        }
        for card in cards if card.word_id in by_id
    ]
    return jsonify({
        "date": today.isoformat(),
        "sourceDate": source_date.isoformat(),
        "refreshHour": 6,
        "quota": None,
        "completed": plan.mandatory_completed,
        "remaining": remaining,
        "words": words,
    })
