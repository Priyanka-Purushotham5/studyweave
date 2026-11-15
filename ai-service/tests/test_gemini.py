"""A1: real client error mapping (httpx mock transport) and FakeGemini behaviour."""
import json

import httpx
import pytest

from app.errors import ApiError
from app.gemini import EMBED_DIM, FakeGemini, RealGemini, audio_path_for


def real(handler, key="k", **kw):
    return RealGemini(api_key=key, client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda s: None, **kw)


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


def test_google_error_message_is_included_without_the_key():
    body = {"error": {"code": 404, "message": "models/old-model is not found for API version v1beta", "status": "NOT_FOUND"}}
    g = real(lambda req: httpx.Response(404, json=body), key="secret-key")
    with pytest.raises(ApiError) as e:
        g.generate_json("glossary", {})
    assert e.value.code == "internal" and "(404)" in e.value.message
    assert "is not found" in e.value.message and "secret-key" not in e.value.message


def test_error_without_json_body_still_maps():
    with pytest.raises(ApiError) as e:
        real(lambda req: httpx.Response(400, text="bad")).generate_json("glossary", {})
    assert e.value.message == "Gemini rejected the request (400)"


def model_of(req) -> str:
    return req.url.path.split("/models/")[1].split(":")[0]


@pytest.fixture
def chain(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "primary")
    monkeypatch.setenv("GEMINI_FALLBACK_MODELS", "second, models/third, primary")


def test_model_chain_dedupes_and_strips_prefix(chain):
    assert real(lambda req: ok_json({})).models == ["primary", "second", "third"]


def test_overloaded_model_falls_back_to_the_next(chain):
    seen = []

    def handler(req):
        seen.append(model_of(req))
        if model_of(req) == "primary":
            return httpx.Response(503, json={"error": {"message": "high demand"}})
        return ok_json({"terms": []})
    g = real(handler)
    assert g.generate_json("glossary", {}) == {"terms": []}
    assert seen == ["primary", "second"] and g.last_model == "second"


def test_model_not_served_404_and_rate_limit_also_fall_back(chain):
    answers = {"primary": httpx.Response(404, json={"error": {"message": "not found"}}),
               "second": httpx.Response(429, json={}), "third": None}
    g = real(lambda req: answers[model_of(req)] or ok_json({"ok": 1}))
    assert g.generate_json("glossary", {}) == {"ok": 1} and g.last_model == "third"


def test_bad_request_does_not_fall_back(chain):
    seen = []

    def handler(req):
        seen.append(model_of(req))
        return httpx.Response(400, json={"error": {"message": "bad"}})
    with pytest.raises(ApiError) as e:
        real(handler).generate_json("glossary", {})
    assert seen == ["primary"] and e.value.code == "internal"


def test_all_models_failing_keeps_the_last_code_and_names_them(chain):
    with pytest.raises(ApiError) as e:
        real(lambda req: httpx.Response(503, json={})).generate_json("glossary", {})
    assert e.value.code == "ai_unavailable" and "primary, second, third" in e.value.message


def test_deadline_stops_further_fallbacks(chain):
    ticks = iter([0, 100, 100, 100])
    seen = []

    def handler(req):
        seen.append(model_of(req))
        return httpx.Response(503, json={})
    g = real(handler, deadline=50, clock=lambda: next(ticks))
    with pytest.raises(ApiError):
        g.generate_json("glossary", {})
    assert seen == ["primary"]


def test_embed_retries_once_when_overloaded():
    calls = iter([httpx.Response(503, json={}), httpx.Response(200, json={"embeddings": [{"values": [0.0] * EMBED_DIM}]})])
    assert len(real(lambda req: next(calls)).embed(["x"])[0]) == EMBED_DIM
