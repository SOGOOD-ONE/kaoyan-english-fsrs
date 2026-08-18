from flask import Blueprint, jsonify

from .api import login_required, selected_word_ids
from .models import UserWordCard, Word

study_self_api = Blueprint("study_self_api", __name__)


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


@study_self_api.get("/study/self-queue")
@login_required
def self_queue(user):
    selected_ids = selected_word_ids(user)
    if not selected_ids:
        return jsonify({"words": [], "total": 0})

    cards = UserWordCard.query.filter(
        UserWordCard.user_id == user.id,
        UserWordCard.word_id.in_(selected_ids),
        UserWordCard.known_excluded.is_(False),
        UserWordCard.review_count > 0,
    ).order_by(
        UserWordCard.due_at.asc(),
        UserWordCard.last_review_at.asc(),
        UserWordCard.id.asc(),
    ).all()

    if not cards:
        return jsonify({"words": [], "total": 0})

    words = Word.query.filter(Word.id.in_([card.word_id for card in cards])).all()
    by_id = {word.id: word for word in words}
    items = []
    for card in cards:
        word = by_id.get(card.word_id)
        if not word:
            continue
        items.append({
            "id": word.id,
            "word": word.word,
            "type": word.word_type,
            "meaning": word.meaning,
            "category": word.category,
            "source": word.source,
            "card": card_json(card),
        })

    return jsonify({"words": items, "total": len(items)})
