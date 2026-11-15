"""Which Gemini text models answer right now, and how fast?

  $env:GEMINI_API_KEY="..."            (PowerShell)
  python -m eval.probe_models                       # default candidates
  python -m eval.probe_models gemini-3.8-flash gemini-flash-latest

Sends one tiny JSON request per model and prints status and seconds. The suggestion ranks by speed only:
prefer a full model (gemini-3.5-flash) over a lite one as GEMINI_MODEL when both answer, since quality matters more.
"""

from __future__ import annotations

import sys
import time

from app.errors import ApiError
from app.gemini import RealGemini

CANDIDATES = ["gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.8-flash"]


def probe(gem: RealGemini, model: str) -> tuple[str, float]:
    start = time.monotonic()
    try:
        gem._json_once(model, "glossary", [{"text": '{"pages":[{"n":1,"text":"Backpropagation uses the chain rule."}]}'}])
        return "OK", time.monotonic() - start
    except ApiError as err:
        return f"{err.code}: {err.message[:120]}", time.monotonic() - start


def main(argv: list[str]) -> int:
    gem = RealGemini()
    if not gem.api_key:
        print("Set GEMINI_API_KEY first.")
        return 2
    ok = []
    for model in argv[1:] or CANDIDATES:
        status, secs = probe(gem, model)
        print(f"{model:28} {secs:5.1f}s  {status}")
        if status == "OK":
            ok.append((secs, model))
    if ok:
        ok.sort()
        print(f'\nSuggested: $env:GEMINI_MODEL="{ok[0][1]}"; $env:GEMINI_FALLBACK_MODELS="{",".join(m for _, m in ok[1:3])}"')
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
