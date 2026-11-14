"""Code-level citation check (task A2).

A quote counts as verified only if it appears in the cited page's text after
normalization. Anything unverified is dropped, never served.
"""

from __future__ import annotations

import re
import unicodedata

_QUOTE_TABLE = str.maketrans(
    {
        "‘": "'",
        "’": "'",
        "‚": "'",
        "‛": "'",
        "“": '"',
        "”": '"',
        "„": '"',
        "–": "-",
        "—": "-",
        "‑": "-",
        " ": " ",
    }
)

# "back-\npropagation" in a PDF is "backpropagation" in a quote.
_HYPHEN_BREAK = re.compile(r"(\w)-\s*\n\s*(\w)")
_SPACES = re.compile(r"\s+")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = text.translate(_QUOTE_TABLE)
    text = _HYPHEN_BREAK.sub(r"\1\2", text)
    text = text.lower()
    return _SPACES.sub(" ", text).strip()


def verify_quote(quote: str, page_text: str) -> bool:
    nq = normalize(quote)
    if not nq:
        return False
    return nq in normalize(page_text)


def filter_verified(items: list[dict], pages: dict[tuple[str, int], str]) -> tuple[list[dict], int]:
    """Keep items whose every evidence entry verifies.

    items: dicts with an "evidence" list of {resourceId, page, quote}.
    pages: {(resourceId, page): text}.
    Returns (kept, dropped_count).
    """
    kept: list[dict] = []
    dropped = 0
    for item in items:
        evidence = item.get("evidence") or []
        ok = bool(evidence) and all(
            verify_quote(ev.get("quote", ""), pages.get((ev.get("resourceId"), ev.get("page")), ""))
            for ev in evidence
        )
        if ok:
            kept.append(item)
        else:
            dropped += 1
    return kept, dropped
