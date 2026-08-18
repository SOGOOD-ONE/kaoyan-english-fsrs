from collections import defaultdict
from datetime import datetime, timedelta

from .models import ReviewLog


def build_history(user_id, days=30):
    end = datetime.utcnow()
    start = end - timedelta(days=max(1, min(days, 365)))
    logs = ReviewLog.query.filter(
        ReviewLog.user_id == user_id,
        ReviewLog.reviewed_at >= start,
        ReviewLog.reviewed_at <= end,
    ).order_by(ReviewLog.reviewed_at.asc()).all()

    daily = defaultdict(lambda: {"reviews": 0, "words": set(), "again": 0, "hard": 0, "good": 0, "easy": 0})
    for log in logs:
        key = log.reviewed_at.date().isoformat()
        row = daily[key]
        row["reviews"] += 1
        row["words"].add(log.word_id)
        if log.rating == 1:
            row["again"] += 1
        elif log.rating == 2:
            row["hard"] += 1
        elif log.rating == 3:
            row["good"] += 1
        elif log.rating == 4:
            row["easy"] += 1

    # Only return dates on which the user actually studied.
    # Empty calendar days are intentionally omitted from the history response.
    items = []
    for day, row in sorted(daily.items()):
        reviews = row["reviews"]
        if reviews <= 0:
            continue
        items.append({
            "date": day,
            "reviews": reviews,
            "words": len(row["words"]),
            "again": row["again"],
            "hard": row["hard"],
            "good": row["good"],
            "easy": row["easy"],
            "accuracy": round((row["good"] + row["easy"]) / reviews * 100, 1),
        })

    review_dates = {item["date"] for item in items}
    streak = 0
    cursor = end.date()
    while cursor.isoformat() in review_dates:
        streak += 1
        cursor -= timedelta(days=1)

    return {
        "days": items,
        "streak": streak,
        "totalReviews": len(logs),
        "activeDays": len(review_dates),
    }
