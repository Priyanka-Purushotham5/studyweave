"""Edge precision rating sheet (task A16).

  python -m eval.edge_sheet make graph.json sheet.csv     # 30-edge sheet for two raters
  python -m eval.edge_sheet tally sheet.csv               # after both raters filled rater1 and rater2

Raters write one of: correct, partly, wrong. Precision strict = correct only; lenient = correct + partly.
"""

from __future__ import annotations

import csv
import json
import sys

RATINGS = ("correct", "partly", "wrong")
FIELDS = ["edge_id", "from", "to", "type", "reason", "from_quote", "to_quote", "rater1", "rater2"]


def sample_edges(edges: list[dict], k: int = 30) -> list[dict]:
    """Evenly spaced and deterministic, so everyone rates the same edges."""
    if len(edges) <= k:
        return list(edges)
    step = len(edges) / k
    return [edges[int(i * step)] for i in range(k)]


def make_sheet(graph: dict, path: str, k: int = 30) -> int:
    names = {n["id"]: n["name"] for n in graph["nodes"]}
    rows = sample_edges(graph["edges"], k)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for e in rows:
            w.writerow({
                "edge_id": e["id"], "from": names.get(e["from"], e["from"]), "to": names.get(e["to"], e["to"]),
                "type": e["type"], "reason": e["reason"],
                "from_quote": e["evidence"]["from"]["quote"], "to_quote": e["evidence"]["to"]["quote"],
                "rater1": "", "rater2": "",
            })
    return len(rows)


def tally(rows: list[dict]) -> dict:
    counts = {r: 0 for r in RATINGS}
    both = agree = 0
    for row in rows:
        marks = [(row.get(c) or "").strip().lower() for c in ("rater1", "rater2")]
        for m in marks:
            if m in counts:
                counts[m] += 1
        if all(m in counts for m in marks):
            both += 1
            agree += marks[0] == marks[1]
    rated = sum(counts.values())
    return {
        "ratings": counts,
        "rated": rated,
        "precision_strict": counts["correct"] / rated if rated else None,
        "precision_lenient": (counts["correct"] + counts["partly"]) / rated if rated else None,
        "raters_agree": (agree / both) if both else None,
    }


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "make":
        with open(sys.argv[2], encoding="utf-8") as f:
            print(f"Wrote {make_sheet(json.load(f), sys.argv[3])} edges to {sys.argv[3]}")
    elif len(sys.argv) == 3 and sys.argv[1] == "tally":
        with open(sys.argv[2], newline="", encoding="utf-8") as f:
            r = tally(list(csv.DictReader(f)))
        fmt = lambda x: "n/a" if x is None else f"{x:.0%}"
        print(f"Ratings: {r['ratings']}")
        print(f"Precision strict: {fmt(r['precision_strict'])}  lenient: {fmt(r['precision_lenient'])}  raters agree: {fmt(r['raters_agree'])}")
    else:
        sys.exit(__doc__)
