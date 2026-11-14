from app.gemini import FakeGemini


def body(pages):
    return {"moduleId": "m_backprop", "pages": pages}


def test_five_raw_concepts_one_bad_quote_gives_four_and_dropped_one(client, pages):
    r = client.post("/v1/concepts/extract", json=body(pages))
    assert r.status_code == 200
    data = r.json()
    assert len(data["concepts"]) == 4 and data["dropped"] == 1
    assert "Overfitting" not in [c["name"] for c in data["concepts"]]


def test_every_served_concept_has_verified_page_evidence(client, pages):
    from app.citations import verify_quote
    text = {(p["resourceId"], p["n"]): p["text"] for p in pages}
    for c in client.post("/v1/concepts/extract", json=body(pages)).json()["concepts"]:
        assert c["evidence"]
        for ev in c["evidence"]:
            assert verify_quote(ev["quote"], text[(ev["resourceId"], ev["page"])])


def test_empty_pages_is_400(client):
    r = client.post("/v1/concepts/extract", json=body([]))
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_request"


def test_concept_with_one_good_and_one_bad_quote_keeps_only_the_good(make_client, pages):
    raw = {"concepts": [{"name": "Chain rule", "definition": "d", "evidence": [
        {"resourceId": "r1", "page": 2, "quote": "multiplying the derivatives of its parts"},
        {"resourceId": "r1", "page": 2, "quote": "made up sentence"}]}]}
    c = make_client(FakeGemini(overrides={"concepts_extract": raw}))
    out = c.post("/v1/concepts/extract", json=body(pages)).json()
    assert len(out["concepts"][0]["evidence"]) == 1 and out["dropped"] == 0


def test_quote_cited_on_the_wrong_page_is_dropped(make_client, pages):
    raw = {"concepts": [{"name": "Chain rule", "definition": "d",
                         "evidence": [{"resourceId": "r1", "page": 1, "quote": "multiplying the derivatives of its parts"}]}]}
    c = make_client(FakeGemini(overrides={"concepts_extract": raw}))
    out = c.post("/v1/concepts/extract", json=body(pages)).json()
    assert out == {"concepts": [], "dropped": 1}


def test_duplicate_names_count_as_dropped(make_client, pages):
    one = {"name": "Chain rule", "definition": "d", "evidence": [{"resourceId": "r1", "page": 2, "quote": "composite function"}]}
    c = make_client(FakeGemini(overrides={"concepts_extract": {"concepts": [one, dict(one, name="chain RULE")]}}))
    out = c.post("/v1/concepts/extract", json=body(pages)).json()
    assert len(out["concepts"]) == 1 and out["dropped"] == 1
