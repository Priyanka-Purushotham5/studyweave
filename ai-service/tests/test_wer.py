import pytest

from eval.wer import compare, wer


def test_one_substitution_in_three_words():
    assert wer("a b c", "a x c") == pytest.approx(1 / 3)


def test_identical_text_is_zero():
    assert wer("The chain rule.", "the chain rule") == 0.0


def test_empty_hypothesis_is_one():
    assert wer("a b c", "") == 1.0


def test_empty_reference_is_an_error():
    with pytest.raises(ValueError):
        wer("", "a b c")


def test_compare_reports_whether_hints_helped():
    ref = "back propagation uses the chain rule"
    without = "back prop agation uses the chain roll"
    with_hints = "back propagation uses the chain rule"
    result = compare(ref, without, with_hints)
    assert result["wer_with_hints"] < result["wer_without_hints"]
    assert result["hints_helped"] is True
    assert result["absolute_change"] < 0
