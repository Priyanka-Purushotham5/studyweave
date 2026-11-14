import pytest

from app.citations import filter_verified, normalize, verify_quote

PAGE = "The chain rule lets us differentiate\ncomposite functions. Back-\npropagation applies it layer by layer."


@pytest.mark.parametrize(
    "quote",
    [
        "The chain rule lets us differentiate",
        "THE CHAIN RULE LETS US DIFFERENTIATE",  # case
        "the  chain   rule lets us differentiate composite functions",  # spacing and line break
        "backpropagation applies it layer by layer",  # hyphenated line break
    ],
)
def test_verified_quotes_pass(quote):
    assert verify_quote(quote, PAGE)


def test_curly_quotes_and_dashes_match_straight_ones():
    page = "It's the model’s “loss” - not accuracy."
    assert verify_quote("It's the model's \"loss\" - not accuracy", page)


@pytest.mark.parametrize("quote", ["", "   ", "gradient descent converges", "chain rule lets us integrate"])
def test_unverified_quotes_fail(quote):
    assert not verify_quote(quote, PAGE)


def test_quote_is_not_verified_against_an_empty_page():
    assert not verify_quote("chain rule", "")


def test_normalize_is_idempotent():
    once = normalize("  Back-\npropagation ’s  ")
    assert normalize(once) == once


def test_filter_verified_drops_items_with_bad_evidence_and_counts_them():
    pages = {("r1", 1): PAGE}
    items = [
        {"name": "Chain rule", "evidence": [{"resourceId": "r1", "page": 1, "quote": "chain rule lets us"}]},
        {"name": "Made up", "evidence": [{"resourceId": "r1", "page": 1, "quote": "not on the page"}]},
        {"name": "Wrong page", "evidence": [{"resourceId": "r1", "page": 9, "quote": "chain rule"}]},
        {"name": "No evidence", "evidence": []},
    ]
    kept, dropped = filter_verified(items, pages)
    assert [i["name"] for i in kept] == ["Chain rule"]
    assert dropped == 3


def test_filter_verified_requires_every_evidence_entry_to_pass():
    pages = {("r1", 1): PAGE}
    item = {
        "evidence": [
            {"resourceId": "r1", "page": 1, "quote": "chain rule"},
            {"resourceId": "r1", "page": 1, "quote": "fabricated"},
        ]
    }
    kept, dropped = filter_verified([item], pages)
    assert kept == [] and dropped == 1
