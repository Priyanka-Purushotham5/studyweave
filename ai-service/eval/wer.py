"""Word error rate harness (task A12). Used for the first-hour gate test:

    python -m eval.wer reference.txt without_hints.txt with_hints.txt

Prints WER for the transcript made without vocabulary hints and the one made with.
"""

from __future__ import annotations

import sys

import jiwer

_NORMALIZE = jiwer.Compose(
    [
        jiwer.ToLowerCase(),
        jiwer.RemovePunctuation(),
        jiwer.RemoveMultipleSpaces(),
        jiwer.Strip(),
    ]
)


def wer(reference: str, hypothesis: str) -> float:
    ref = _NORMALIZE(reference)
    hyp = _NORMALIZE(hypothesis)
    if not ref:
        raise ValueError("reference is empty")
    if not hyp:
        return 1.0
    return float(jiwer.wer(ref, hyp))


def compare(reference: str, without_hints: str, with_hints: str) -> dict:
    a = wer(reference, without_hints)
    b = wer(reference, with_hints)
    return {
        "wer_without_hints": a,
        "wer_with_hints": b,
        "absolute_change": b - a,
        "hints_helped": b < a,
    }


def _read(path: str) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("usage: python -m eval.wer reference.txt without_hints.txt with_hints.txt")
    result = compare(_read(sys.argv[1]), _read(sys.argv[2]), _read(sys.argv[3]))
    print(f"WER without hints: {result['wer_without_hints']:.3f}")
    print(f"WER with hints:    {result['wer_with_hints']:.3f}")
    print(f"Change:            {result['absolute_change']:+.3f}")
    print("Hints helped" if result["hints_helped"] else "Hints did NOT help")
