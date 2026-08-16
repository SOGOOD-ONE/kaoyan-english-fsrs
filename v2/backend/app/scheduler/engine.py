from dataclasses import dataclass
from datetime import datetime, timedelta
from math import exp


@dataclass(frozen=True)
class ScheduleResult:
    state: str
    stability: float
    difficulty: float
    due_at: datetime


class StudyScheduler:
    """考研英语专用调度器。

    UI 不直接依赖本算法内部字段。算法将来可以迭代版本，但 API contract 保持不变。
    新词、次日强制复习和自主复习由上层分别决定；本类只负责一次复习后的状态迁移。
    """

    INITIAL_STABILITY = 1.0
    INITIAL_DIFFICULTY = 5.0
    MIN_STABILITY = 0.1
    MAX_STABILITY = 365.0

    def review(self, *, state: str, stability: float, difficulty: float, rating: int, now: datetime, elapsed_days: float) -> ScheduleResult:
        # 1=Again, 2=Hard, 3=Good, 4=Easy
        rating = max(1, min(4, rating))
        d = min(10.0, max(1.0, difficulty))
        s = max(self.MIN_STABILITY, stability)

        if rating == 1:
            d = min(10.0, d + 0.7)
            s = max(self.MIN_STABILITY, s * 0.35)
            interval = 0.04 if state == "new" else 0.15
            next_state = "learning"
        else:
            d_delta = {2: 0.25, 3: -0.15, 4: -0.35}[rating]
            d = min(10.0, max(1.0, d + d_delta))
            recall_gap = max(0.0, min(1.0, elapsed_days / max(s, 0.1)))
            difficulty_factor = max(0.25, (11.0 - d) / 10.0)
            rating_factor = {2: 0.75, 3: 1.0, 4: 1.3}[rating]
            growth = 1.0 + (0.55 + 1.45 * recall_gap) * difficulty_factor * rating_factor
            s = min(self.MAX_STABILITY, max(self.MIN_STABILITY, s * growth))
            interval = self.interval_days(s, rating)
            next_state = "review" if s >= 1.0 else "learning"

        return ScheduleResult(next_state, round(s, 4), round(d, 4), now + timedelta(days=interval))

    @staticmethod
    def interval_days(stability: float, rating: int) -> float:
        target_retention = 0.88
        base = stability * ((1.0 / target_retention) - 1.0)
        multiplier = {2: 0.55, 3: 1.0, 4: 1.35}.get(rating, 1.0)
        return max(0.05, min(365.0, base * multiplier))

    @staticmethod
    def retrievability(stability: float, elapsed_days: float) -> float:
        if elapsed_days <= 0:
            return 1.0
        return exp(-elapsed_days / max(stability, 0.1))
