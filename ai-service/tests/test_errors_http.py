"""Every error from A has the contract shape; failure drills."""
import pytest

from app.gemini import FakeGemini


@pytest.mark.parametrize("code,status", [("rate_limited", 429), ("ai_unavailable", 503), ("internal", 500)])
def test_gemini_failure_maps_to_contract_error(make_client, code, status):
    c = make_client(FakeGemini(fail_with=code))
    r = c.post("/v1/glossary", json={"pages": [{"n": 1, "text": "x"}]})
    assert r.status_code == status
    assert set(r.json()) == {"error"} and r.json()["error"]["code"] == code and r.json()["error"]["message"]


def test_invalid_body_is_bad_request(client):
    r = client.post("/v1/glossary", json={"nope": 1})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_request"
