from datetime import timedelta
import pytest
from insights.time_utils import parse_range, parse_bucket


@pytest.mark.parametrize("s,expected", [
    ("1h", timedelta(hours=1)),
    ("24h", timedelta(hours=24)),
    ("7d", timedelta(days=7)),
    ("15m", timedelta(minutes=15)),
])
def test_parse_range(s, expected):
    assert parse_range(s) == expected


def test_parse_range_invalid():
    with pytest.raises(ValueError):
        parse_range("banana")


@pytest.mark.parametrize("s,expected", [
    ("1m", timedelta(minutes=1)),
    ("5m", timedelta(minutes=5)),
    ("1h", timedelta(hours=1)),
])
def test_parse_bucket(s, expected):
    assert parse_bucket(s) == expected
