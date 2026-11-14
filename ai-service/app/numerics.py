"""Double-solve check for numerical questions (task A13).

A numerical problem is served only if two independent solves agree within relative 1e-6.
"""

from __future__ import annotations

import math
import re

REL_TOL = 1e-6
_NUMBER = re.compile(r"[-+]?(?:\d+(?:,\d{3})*(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?")
_FRACTION = re.compile(r"^\s*([-+]?\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)\s*$")


def parse_number(text: object) -> float | None:
    """First number in the text ("4.8 units" -> 4.8, "1/4" -> 0.25). None if there is none."""
    if isinstance(text, bool):
        return None
    if isinstance(text, (int, float)):
        return float(text) if math.isfinite(text) else None
    if not isinstance(text, str):
        return None
    frac = _FRACTION.match(text)
    if frac:
        den = float(frac.group(2))
        return float(frac.group(1)) / den if den else None
    m = _NUMBER.search(text)
    if not m:
        return None
    value = float(m.group(0).replace(",", ""))
    return value if math.isfinite(value) else None


def agree(a: float, b: float, rel: float = REL_TOL) -> bool:
    if a == b:
        return True
    return abs(a - b) <= rel * max(abs(a), abs(b))


def double_solve(solve_a: object, solve_b: object) -> float | None:
    """The agreed value, or None when either solve is unparseable or they disagree."""
    a, b = parse_number(solve_a), parse_number(solve_b)
    if a is None or b is None or not agree(a, b):
        return None
    return a
