from flask import Blueprint, jsonify

from .api import login_required, selected_word_ids
from .models import UserSetting, UserWordCard, Word
from .time_utils import utc_now_naive

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
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    quota = int(settings.daily_review_quota if settings else 100)
    if not selected_ids or quota <= 0:
        return jsonify({"words": [], "total": 0, "quota": quota})

    cards = UserWordCard.query.filter(
        UserWordCard.user_id == user.id,
        UserWordCard.word_id.in_(selected_ids),
        UserWordCard.known_excluded.is_(False),
        UserWordCard.review_count > 0,
    ).all()

    now = utc_now_naive()
    def score(card):
        overdue_days = max(0.0, (now - card.due_at).total_seconds() / 86400.0) if card.due_at else 0.0
        stability = max(float(card.stability or 0.0), 0.1)
        difficulty = float(card.difficulty or 5.0)
        state_weight = 0 if card.state == "review" else 1
        return (state_weight, -overdue_days / stability, stability, -difficulty, card.last_review_at or now)

    cards.sort(key=score)
    cards = cards[:quota]
    words = Word.query.filter(Word.id.in_([card.word_id for card in cards])).all() if cards else []
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

    return jsonify({"words": items, "total": len(items), "quota": quota})
