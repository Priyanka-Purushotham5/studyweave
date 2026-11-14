"""Citation pass rate (task A16).

Save the JSON responses of /v1/questions/generate and /v1/concepts/extract (any mix, one file with a list,
or one response per file) and run:

  python -m eval.citation_rate responses.json [more.json ...]

passed = items served, dropped = items removed because a quote was not on the page.
Pass rate = passed / (passed + dropped). Aim to run it over 100 generated items for the pitch number.
"""

from __future__ import annotations

import json
import sys


def citation_rate(responses: list[dict]) -> dict:
    passed = dropped = 0
    for r in responses:
        items = r.get("questions", r.get("concepts", []))
        passed += len(items)
        dropped += int(r.get("dropped", 0))
    total = passed + dropped
    return {"passed": passed, "dropped": dropped, "total": total, "pass_rate": (passed / total) if total else None}


def load(paths: list[str]) -> list[dict]:
    out: list[dict] = []
    for p in paths:
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
        out.extend(data if isinstance(data, list) else [data])
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    result = citation_rate(load(sys.argv[1:]))
    rate = "n/a" if result["pass_rate"] is None else f"{result['pass_rate']:.1%}"
    print(f"Served: {result['passed']}  Dropped: {result['dropped']}  Pass rate: {rate}")
