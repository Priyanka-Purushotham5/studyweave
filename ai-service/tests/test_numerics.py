import pytest

from app.numerics import agree, double_solve, parse_number


@pytest.mark.parametrize("text,value", [("4.8", 4.8), ("4.8 units", 4.8), ("-3", -3.0), ("1,250.5", 1250.5), ("1/4", 0.25), ("1e-3", 0.001), (7, 7.0)])
def test_parse_number(text, value):
    assert parse_number(text) == pytest.approx(value)


@pytest.mark.parametrize("text", ["none", "", None, "1/0", True])
def test_parse_number_rejects(text):
    assert parse_number(text) is None


def test_agree_uses_relative_1e6():
    assert agree(1_000_000.0, 1_000_000.5)  # 5e-7 relative
    assert not agree(1_000_000.0, 1_000_002.0)  # 2e-6 relative
    assert agree(0.0, 0.0) and not agree(0.0, 1e-9)


def test_double_solve_returns_value_or_none():
    assert double_solve("2.5", "2.5000001") == 2.5
    assert double_solve("2.5", "2.6") is None
    assert double_solve("2.5", "x") is None
