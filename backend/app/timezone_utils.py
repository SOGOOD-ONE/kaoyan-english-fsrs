from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

DEFAULT_TIMEZONE = "Asia/Shanghai"


def user_timezone(user):
    value = getattr(getattr(user, "setting", None), "timezone", None)
    try:
        return ZoneInfo(value or DEFAULT_TIMEZONE)
    except Exception:
        return ZoneInfo(DEFAULT_TIMEZONE)


def local_now(user):
    return datetime.now(timezone.utc).astimezone(user_timezone(user))


def local_today(user):
    return local_now(user).date()


def local_day_start_utc(user, day=None):
    zone = user_timezone(user)
    local_day = day or local_now(user).date()
    return datetime.combine(local_day, time.min, tzinfo=zone).astimezone(timezone.utc).replace(tzinfo=None)


def local_day_end_utc(user, day=None):
    zone = user_timezone(user)
    local_day = day or local_now(user).date()
    return datetime.combine(local_day + timedelta(days=1), time.min, tzinfo=zone).astimezone(timezone.utc).replace(tzinfo=None)


def utc_now_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)
