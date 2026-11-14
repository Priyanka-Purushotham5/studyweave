from fastapi.testclient import TestClient

from app.errors import ApiError, STATUS_BY_CODE
from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def test_healthz():
    r = client.get("/healthz")
    assert r.status_code == 200 and r.json() == {"ok": True}


def test_every_error_code_has_the_contract_status():
    assert STATUS_BY_CODE == {
        "bad_request": 400,
        "scanned_pdf": 422,
        "not_found": 404,
        "rate_limited": 429,
        "ai_unavailable": 503,
        "internal": 500,
    }
    assert ApiError("ai_unavailable", "Gemini timed out").body() == {
        "error": {"code": "ai_unavailable", "message": "Gemini timed out"}
    }


def test_invalid_body_is_a_contract_shaped_400():
    r = client.post("/v1/flag", json={"words": "nope"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "bad_request"


def test_unknown_route_is_a_404():
    assert client.get("/nope").status_code == 404


def test_flag_endpoint_accepts_glossary_objects_and_returns_contract_shape():
    body = {
        "words": [
            {"w": "we", "startSec": 0.0, "endSec": 0.2},
            {"w": "use", "startSec": 0.2, "endSec": 0.4},
            {"w": "back", "startSec": 0.4, "endSec": 0.6},
            {"w": "propagation", "startSec": 0.6, "endSec": 1.2},
        ],
        "glossary": [{"term": "backpropagation", "definition": "..."}],
        "corrections": [],
    }
    r = client.post("/v1/flag", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["autoFixed"] == []
    assert data["flags"][0]["suggestion"] == "backpropagation"
    assert set(data["flags"][0]) == {"id", "startIdx", "endIdx", "heard", "suggestion", "score", "reason"}
