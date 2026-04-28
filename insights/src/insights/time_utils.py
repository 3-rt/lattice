import re
from datetime import timedelta

_PATTERN = re.compile(r"^(\d+)([smhd])$")
_UNITS = {"s": "seconds", "m": "minutes", "h": "hours", "d": "days"}


def _parse(s: str) -> timedelta:
    m = _PATTERN.match(s)
    if not m:
        raise ValueError(f"invalid duration: {s!r}")
    n, unit = int(m.group(1)), m.group(2)
    return timedelta(**{_UNITS[unit]: n})


def parse_range(s: str) -> timedelta:
    return _parse(s)


def parse_bucket(s: str) -> timedelta:
    return _parse(s)
