"""Caption flagging (task A11).

Slide glossary terms are compared against 1-3 word windows of the transcript.
startIdx is inclusive and endIdx is exclusive, both indexes into words[].

Rules:
- an exact glossary match is correct and protects its words from being flagged
- windows shorter than 4 characters are skipped
- fuzzy score is rapidfuzz ratio, flag at or above THRESHOLD (tune on the real clip)
- overlapping candidates: the best score wins, flags never overlap
- a stored correction seen at least AUTO_FIX_COUNT times is fixed automatically
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from rapidfuzz import fuzz

THRESHOLD = 85
MIN_CHARS = 4
MAX_WINDOW = 3
AUTO_FIX_COUNT = 2

_EDGE_PUNCT = re.compile(r"^[^\w]+|[^\w]+$")


def _norm_word(w: str) -> str:
    return _EDGE_PUNCT.sub("", w.lower())


def _norm_phrase(words: list[str]) -> str:
    return " ".join(x for x in (_norm_word(w) for w in words) if x)


@dataclass
class _Cand:
    start: int
    end: int
    score: float
    heard: str
    suggestion: str


def _overlaps(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return a_start < b_end and b_start < a_end


def flag(
    words: list[dict],
    glossary: list[str],
    corrections: list[dict] | None = None,
    threshold: float = THRESHOLD,
) -> tuple[list[dict], list[dict]]:
    """Return (flags, auto_fixed)."""
    tokens = [w["w"] for w in words]
    n = len(tokens)
    terms = {}
    for term in glossary:
        key = _norm_phrase(term.split())
        if key:
            terms[key] = term

    fixes = {}
    for c in corrections or []:
        if c.get("count", 0) >= AUTO_FIX_COUNT:
            key = _norm_phrase(c["heard"].split())
            if key:
                fixes[key] = c["correct"]

    protected = [False] * n
    auto_fixed: list[dict] = []
    exact_spans: list[tuple[int, int]] = []

    # Pass 1: windows that are already correct or auto-fixable, longest first.
    for size in range(MAX_WINDOW, 0, -1):
        for i in range(0, n - size + 1):
            if any(protected[i : i + size]):
                continue
            key = _norm_phrase(tokens[i : i + size])
            if not key:
                continue
            if key in fixes:
                auto_fixed.append({"startIdx": i, "endIdx": i + size, "to": fixes[key]})
                for j in range(i, i + size):
                    protected[j] = True
            elif key in terms:
                exact_spans.append((i, i + size))
                for j in range(i, i + size):
                    protected[j] = True

    # Pass 2: fuzzy candidates on words that are not protected.
    cands: list[_Cand] = []
    for size in range(1, MAX_WINDOW + 1):
        for i in range(0, n - size + 1):
            if any(protected[i : i + size]):
                continue
            heard_key = _norm_phrase(tokens[i : i + size])
            if len(heard_key) < MIN_CHARS:
                continue
            best_term, best_score = None, 0.0
            for key, original in terms.items():
                score = fuzz.ratio(heard_key, key)
                if score > best_score:
                    best_term, best_score = original, score
            if best_term is not None and best_score >= threshold:
                cands.append(
                    _Cand(i, i + size, best_score, " ".join(tokens[i : i + size]), best_term)
                )

    cands.sort(key=lambda c: (-c.score, -(c.end - c.start), c.start))
    chosen: list[_Cand] = []
    for c in cands:
        if all(not _overlaps(c.start, c.end, k.start, k.end) for k in chosen):
            chosen.append(c)
    chosen.sort(key=lambda c: c.start)

    flags = [
        {
            "id": f"f{idx + 1}",
            "startIdx": c.start,
            "endIdx": c.end,
            "heard": c.heard,
            "suggestion": c.suggestion,
            "score": round(c.score),
            "reason": "close match to glossary term",
        }
        for idx, c in enumerate(chosen)
    ]
    auto_fixed.sort(key=lambda f: f["startIdx"])
    return flags, auto_fixed
