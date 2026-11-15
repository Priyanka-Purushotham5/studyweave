"""Live checks against the real Gemini API. Skipped unless RUN_LIVE_GEMINI_TESTS=1 and GEMINI_API_KEY is set."""
import os

import pytest

from app.gemini import EMBED_DIM, RealGemini

pytestmark = [pytest.mark.live, pytest.mark.skipif(os.environ.get("RUN_LIVE_GEMINI_TESTS") != "1" or not os.environ.get("GEMINI_API_KEY"), reason="live Gemini requires explicit opt-in and a key")]


def test_live_embed_returns_768_numbers():
    vectors = RealGemini().embed(["chain rule"])
    assert len(vectors) == 1 and len(vectors[0]) == EMBED_DIM


def test_live_glossary_returns_terms():
    raw = RealGemini().generate_json("glossary", {"pages": [{"n": 1, "text": "Backpropagation applies the chain rule to compute gradients."}]})
    assert raw["terms"]
