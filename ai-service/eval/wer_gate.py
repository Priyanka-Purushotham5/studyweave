"""The first-hour gate test: does passing slide vocabulary to the transcriber lower WER?

  set GEMINI_API_KEY=...            (PowerShell: $env:GEMINI_API_KEY="...")
  python -m eval.wer_gate clip.mp3 reference.txt slides.pptx

Uses a 5-minute STEM clip you are allowed to send to Gemini (free-tier data can be used to train
Google models, so use public or your own audio) and a hand-typed reference transcript.
Writes without_hints.txt and with_hints.txt next to the clip and prints both WERs.
Not yet run against the live API.
"""

from __future__ import annotations

import mimetypes
import pathlib
import sys

from app.endpoints.glossary import clean_terms
from app.endpoints.parse import parse_pdf, parse_pptx
from app.gemini import GeminiClient, RealGemini
from eval.wer import compare


def slide_pages(path: pathlib.Path) -> list[dict]:
    data = path.read_bytes()
    return parse_pptx(data) if path.suffix.lower() == ".pptx" else parse_pdf(data)


def run_gate(gem: GeminiClient, audio: bytes, mime: str, reference: str, pages: list[dict]) -> dict:
    terms = clean_terms(gem.generate_json("glossary", {"pages": pages}).get("terms"))
    glossary = [t["term"] for t in terms]
    plain = " ".join(w["w"] for w in gem.transcribe(audio, mime, [], []).get("words", []))
    hinted = " ".join(w["w"] for w in gem.transcribe(audio, mime, glossary, []).get("words", []))
    result = compare(reference, plain, hinted)
    result.update({"without_hints_text": plain, "with_hints_text": hinted, "glossary_size": len(glossary)})
    return result


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print(__doc__)
        return 2
    clip, ref, slides = (pathlib.Path(a) for a in argv[1:])
    gem = RealGemini()
    if not gem.api_key:
        print("Set GEMINI_API_KEY first.")
        return 2
    mime = mimetypes.guess_type(clip.name)[0] or "audio/mpeg"
    out = run_gate(gem, clip.read_bytes(), mime, ref.read_text(encoding="utf-8"), slide_pages(slides))
    (clip.parent / "without_hints.txt").write_text(out["without_hints_text"], encoding="utf-8")
    (clip.parent / "with_hints.txt").write_text(out["with_hints_text"], encoding="utf-8")
    print(f"Glossary terms from slides: {out['glossary_size']}")
    print(f"WER without hints: {out['wer_without_hints']:.3f}")
    print(f"WER with hints:    {out['wer_with_hints']:.3f}")
    print(f"Change:            {out['absolute_change']:+.3f}")
    print("Hints helped." if out["hints_helped"] else "Hints did NOT help: check the glossary and the prompt before building more on this.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
