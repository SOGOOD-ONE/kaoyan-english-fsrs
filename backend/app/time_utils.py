from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from .models import UserSetting

DEFAULT_TIMEZONE = "Asia/Shanghai"
MANDATORY_REFRESH_HOUR = 6


def user_timezone(user):
    settings = UserSetting.query.filter_by(user_id=user.id).first()
    try:
        return ZoneInfo(settings.timezone if settings and settings.timezone else DEFAULT_TIMEZONE)
    except Exception:
        return ZoneInfo(DEFAULT_TIMEZONE)


def local_now(user):
    return datetime.now(timezone.utc).astimezone(user_timezone(user))


def local_today(user):
    return local_now(user).date()


def local_day_start_utc(user, day: date):
    zone = user_timezone(user)
    local_start = datetime.combine(day, time.min, tzinfo=zone)
    return local_start.astimezone(timezone.utc).replace(tzinfo=None)


def local_day_end_utc(user, day: date):
    zone = user_timezone(user)
    local_end = datetime.combine(day, time.max, tzinfo=zone)
    return local_end.astimezone(timezone.utc).replace(tzinfo=None)


def mandatory_source_date(user):
    now = local_now(user)
    # The mandatory-review batch refreshes at 06:00 local time and targets
    # the previous calendar day's completed new-word learning.
    return now.date() - timedelta(days=1 if now.hour >= MANDATORY_REFRESH_HOUR else 2)


def local_date_range_utc(user, day: date):
    return local_day_start_utc(user, day), local_day_end_utc(user, day)
