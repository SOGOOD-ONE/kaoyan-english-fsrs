from dataclasses import dataclass
from datetime import datetime, timedelta
import math


@dataclass
class ScheduleResult:
    state: str
    stability: float
    difficulty: float
    due_at: datetime


class StudyScheduler:
    """Product scheduler. This is intentionally independent of FSRS."""

    MIN_STABILITY = 0.25
    MAX_STABILITY = 3650.0
    MIN_DIFFICULTY = 1.0
    MAX_DIFFICULTY = 10.0

    def review(self, *, stability: float, difficulty: float, rating: int,
               elapsed_days: float, now: datetime, review_count: int = 0) -> ScheduleResult:
        # 1=again, 2=hard, 3=good, 4=easy
        stability = max(self.MIN_STABILITY, stability or 1.0)
        difficulty = difficulty or 5.0
        difficulty += {1: 0.7, 2: 0.2, 3: -0.1, 4: -0.35}.get(rating, 0)
        difficulty = min(self.MAX_DIFFICULTY, max(self.MIN_DIFFICULTY, difficulty))

        if rating == 1:
            stability = max(self.MIN_STABILITY, stability * 0.35)
            interval_days = 0.02 if review_count == 0 else 0.15
            state = 'learning'
        else:
            retrievability = math.exp(-max(elapsed_days, 0.0) / max(stability, 0.25))
            growth = {2: 1.20, 3: 1.65, 4: 2.20}[rating]
            difficulty_factor = 1.15 - (difficulty / 20.0)
            recall_factor = 1.0 + max(0.0, 1.0 - retrievability)
            stability = stability * growth * difficulty_factor * recall_factor
            stability = min(self.MAX_STABILITY, max(self.MIN_STABILITY, stability))
            interval_days = max(0.25, stability * 1.6)
            if rating == 2:
                interval_days *= 0.65
            elif rating == 4:
                interval_days *= 1.25
            state = 'review' if stability >= 2.0 else 'learning'

        return ScheduleResult(
            state=state,
            stability=stability,
            difficulty=difficulty,
            due_at=now + timedelta(days=min(interval_days, 3650.0)),
        )
