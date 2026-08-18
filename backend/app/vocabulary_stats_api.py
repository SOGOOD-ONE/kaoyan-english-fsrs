from datetime import datetime

from flask import Blueprint, jsonify

from . import db
from .api import login_required
from .models import UserVocabulary, VocabularyWord, UserWordCard

vocabulary_stats_api = Blueprint("vocabulary_stats_api", __name__)


@vocabulary_stats_api.get("/vocabularies/stats")
@login_required
def vocabulary_stats_batch(user):
    enabled_rows = UserVocabulary.query.filter_by(user_id=user.id, enabled=True).all()
    vocab_ids = [row.vocabulary_id for row in enabled_rows]
    if not vocab_ids:
        return jsonify({})

    links = VocabularyWord.query.filter(VocabularyWord.vocabulary_id.in_(vocab_ids)).all()
    word_ids_by_vocab = {}
    all_word_ids = set()
    for link in links:
        word_ids_by_vocab.setdefault(link.vocabulary_id, set()).add(link.word_id)
        all_word_ids.add(link.word_id)

    cards = UserWordCard.query.filter(
        UserWordCard.user_id == user.id,
        UserWordCard.word_id.in_(all_word_ids),
    ).all() if all_word_ids else []
    cards_by_word = {card.word_id: card for card in cards}

    now = datetime.utcnow()
    result = {}
    for vocabulary_id in vocab_ids:
        ids = word_ids_by_vocab.get(vocabulary_id, set())
        learned = [cards_by_word[word_id] for word_id in ids if word_id in cards_by_word and cards_by_word[word_id].review_count > 0]
        due = [card for card in learned if card.due_at <= now]
        mastered = [card for card in learned if card.state == "review"]
        result[vocabulary_id] = {
            "wordCount": len(ids),
            "learned": len(learned),
            "due": len(due),
            "new": max(0, len(ids) - len(learned)),
            "masteryRate": round(len(mastered) / len(ids) * 100, 1) if ids else 0,
        }
    return jsonify(result)
