from insights.ingestion.sse_client import parse_sse_lines


def test_parses_single_event():
    lines = ["id: 7", "data: {\"foo\":\"bar\"}", ""]
    events = list(parse_sse_lines(iter(lines)))
    assert events == [("7", '{"foo":"bar"}')]


def test_parses_multiple_events():
    lines = [
        "id: 1", 'data: {"a":1}', "",
        "id: 2", 'data: {"b":2}', "",
    ]
    events = list(parse_sse_lines(iter(lines)))
    assert events == [("1", '{"a":1}'), ("2", '{"b":2}')]


def test_ignores_comments_and_blank_prefix():
    lines = [": keepalive", "id: 3", 'data: {"x":1}', ""]
    events = list(parse_sse_lines(iter(lines)))
    assert events == [("3", '{"x":1}')]
