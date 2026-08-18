from datetime import datetime

from flask import Blueprint, jsonify, request

from .api import card_json, login_required
from .models import ReviewLog, UserWordCard

study_sync_api = Blueprint("study_sync_api", __name__)


def parse_sync_since(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


@study_sync_api.get("/sync/study-incremental")
@login_required
def sync_study_incremental(user):
    server_now = datetime.utcnow()
    since = parse_sync_since(request.args.get("since"))

    if since is None:
        cards = UserWordCard.query.filter_by(user_id=user.id).all()
        logs = ReviewLog.query.filter_by(user_id=user.id).order_by(ReviewLog.reviewed_at.asc()).all()
    else:
        logs = ReviewLog.query.filter(
            ReviewLog.user_id == user.id,
            ReviewLog.reviewed_at > since,
            ReviewLog.reviewed_at <= server_now,
        ).order_by(ReviewLog.reviewed_at.asc()).all()
        changed_word_ids = {row.word_id for row in logs}
        changed_word_ids.update(
            row.word_id for row in UserWordCard.query.filter(
                UserWordCard.user_id == user.id,
                UserWordCard.last_review_at.isnot(None),
                UserWordCard.last_review_at > since,
                UserWordCard.last_review_at <= server_now,
            ).all()
        )
        cards = UserWordCard.query.filter(
            UserWordCard.user_id == user.id,
            UserWordCard.word_id.in_(changed_word_ids),
        ).all() if changed_word_ids else []

    return jsonify({
        "cards": [card_json(card) for card in cards],
        "reviews": [
            {
                "id": row.id,
                "wordId": row.word_id,
                "rating": row.rating,
                "reviewedAt": row.reviewed_at.isoformat(),
                "reviewType": row.review_type,
            }
            for row in logs
        ],
        "serverNow": server_now.isoformat(),
    })
