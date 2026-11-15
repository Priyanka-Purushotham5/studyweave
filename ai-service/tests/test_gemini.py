"""A1: real client error mapping (httpx mock transport) and FakeGemini behaviour."""
import json

import httpx
import pytest

from app.errors import ApiError
from app.gemini import EMBED_DIM, FakeGemini, RealGemini, audio_path_for


def real(handler, key="k"):
    return RealGemini(api_key=key, client=httpx.Client(transport=httpx.MockTransport(handler)))


def ok_json(payload: dict):
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}]})


def test_429_becomes_rate_limited():
    g = real(lambda req: httpx.Response(429, json={}))
    with pytest.raises(ApiError) as e:
        g.generate_json("glossary", {})
    assert e.value.code == "rate_limited" and e.value.status == 429


def test_timeout_becomes_ai_unavailable():
    def handler(req):
        raise httpx.ReadTimeout("slow", request=req)
    with pytest.raises(ApiError) as e:
        real(handler).generate_json("glossary", {})
    assert e.value.code == "ai_unavailable" and e.value.status == 503


def test_server_error_becomes_ai_unavailable():
    with pytest.raises(ApiError) as e:
        real(lambda req: httpx.Response(503, json={})).generate_json("glossary", {})
    assert e.value.code == "ai_unavailable"


def test_bad_json_is_retried_once_then_internal():
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "not json"}]}}]})
    with pytest.raises(ApiError) as e:
        real(handler).generate_json("glossary", {})
    assert e.value.code == "internal" and len(calls) == 2


def test_bad_json_then_good_json_succeeds_on_retry():
    answers = iter([httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "oops"}]}}]}), ok_json({"terms": []})])
    assert real(lambda req: next(answers)).generate_json("glossary", {}) == {"terms": []}


def test_missing_key_is_internal_error(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(ApiError) as e:
        real(lambda req: ok_json({}), key="").generate_json("glossary", {})
    assert e.value.code == "internal"


def test_key_is_sent_in_header_not_url():
    seen = {}

    def handler(req):
        seen["url"], seen["key"] = str(req.url), req.headers.get("x-goog-api-key")
        return ok_json({"terms": []})
    real(handler, key="secret").generate_json("glossary", {})
    assert seen["key"] == "secret" and "secret" not in seen["url"]


def test_embed_checks_dimension():
    bad = real(lambda req: httpx.Response(200, json={"embeddings": [{"values": [0.1, 0.2]}]}))
    with pytest.raises(ApiError) as e:
        bad.embed(["x"])
    assert e.value.code == "internal"
    good = real(lambda req: httpx.Response(200, json={"embeddings": [{"values": [0.0] * EMBED_DIM}]}))
    assert len(good.embed(["x"])[0]) == EMBED_DIM


def test_fake_embed_is_deterministic_and_768():
    f = FakeGemini()
    a, b = f.embed(["chain rule"]), f.embed(["chain rule"])
    assert a == b and len(a[0]) == EMBED_DIM


def test_fake_fail_with_raises_that_code():
    with pytest.raises(ApiError) as e:
        FakeGemini(fail_with="rate_limited").generate_json("glossary", {})
    assert e.value.code == "rate_limited"


def test_audio_path_switches_above_20mb():
    assert audio_path_for(20 * 1024 * 1024) == "inline"
    assert audio_path_for(20 * 1024 * 1024 + 1) == "files"
