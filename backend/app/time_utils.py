from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from .models import UserSetting

DEFAULT_TIMEZONE = "Asia/Shanghai"
MANDATORY_REFRESH_HOUR = 6
BEIJING_ZONE = ZoneInfo(DEFAULT_TIMEZONE)


def user_timezone(user):
    # The application uses Beijing time globally. Keep this helper so all
    # existing date/time code continues to share one timezone source.
    return BEIJING_ZONE


def local_now(user):
    return datetime.now(timezone.utc).astimezone(BEIJING_ZONE)


def local_today(user):
    return local_now(user).date()


def local_day_start_utc(user, day: date):
    local_start = datetime.combine(day, time.min, tzinfo=BEIJING_ZONE)
    return local_start.astimezone(timezone.utc).replace(tzinfo=None)


def local_day_end_utc(user, day: date):
    local_end = datetime.combine(day, time.max, tzinfo=BEIJING_ZONE)
    return local_end.astimezone(timezone.utc).replace(tzinfo=None)


def mandatory_source_date(user):
    now = local_now(user)
    return now.date() - timedelta(days=1 if now.hour >= MANDATORY_REFRESH_HOUR else 2)


def local_date_range_utc(user, day: date):
    return local_day_start_utc(user, day), local_day_end_utc(user, day)
