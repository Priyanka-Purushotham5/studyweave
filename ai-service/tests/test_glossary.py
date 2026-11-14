from app.endpoints.glossary import clean_terms
from app.gemini import FakeGemini

PAGES = {"pages": [{"n": 1, "text": "x"}]}


def test_fixture_glossary_contains_backpropagation_deduped_and_short_terms_dropped(client):
    terms = client.post("/v1/glossary", json=PAGES).json()["terms"]
    names = [t["term"] for t in terms]
    assert "Backpropagation" in names
    assert [n.lower() for n in names].count("backpropagation") == 1  # case-insensitive dedupe
    assert "lr" not in names  # under 3 characters


def test_keeps_the_first_spelling():
    terms = clean_terms([{"term": "ReLU", "definition": "a"}, {"term": "relu", "definition": "b"}])
    assert terms == [{"term": "ReLU", "definition": "a"}]


def test_capped_at_200(make_client):
    raw = {"terms": [{"term": f"term{i:04d}", "definition": ""} for i in range(300)]}
    c = make_client(FakeGemini(overrides={"glossary": raw}))
    assert len(c.post("/v1/glossary", json=PAGES).json()["terms"]) == 200


def test_malformed_model_items_are_skipped(make_client):
    raw = {"terms": ["junk", {"term": 5}, {"term": "Gradient"}, {}]}
    c = make_client(FakeGemini(overrides={"glossary": raw}))
    assert [t["term"] for t in c.post("/v1/glossary", json=PAGES).json()["terms"]] == ["Gradient"]


def test_empty_pages_is_400(client):
    assert client.post("/v1/glossary", json={"pages": []}).status_code == 400
