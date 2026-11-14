from app.gemini import FakeGemini

NAMES = ["Backpropagation", "Chain rule", "Gradient descent", "Activation functions"]


def tag(client, concepts=NAMES):
    return client.post("/v1/papers/tag", json={"pages": [{"n": 1, "text": "paper"}], "concepts": concepts}).json()["questions"]


def test_unknown_concept_names_are_dropped_and_names_are_canonical(client):
    qs = tag(client)
    assert qs[0]["concepts"] == ["Backpropagation", "Chain rule"]
    assert qs[1]["concepts"] == ["Gradient descent"]  # "Learning rate" was not in the input list


def test_tag_matches_case_insensitively_and_returns_input_spelling(make_client):
    raw = {"questions": [{"text": "q", "concepts": ["CHAIN RULE", "chain rule"]}]}
    out = tag(make_client(FakeGemini(overrides={"papers_tag": raw})))
    assert out[0]["concepts"] == ["Chain rule"]


def test_video_text_returns_pages_and_approximate_flag_for_short_video(client):
    out = client.post("/v1/video/text", json={"url": "https://www.youtube.com/watch?v=abc"}).json()
    assert [p["n"] for p in out["pages"]] == [1, 2]
    assert out["pages"][1]["startSec"] == 240 and out["approximateTimestamps"] is True


def test_video_over_10_minutes_has_no_timestamps(make_client):
    raw = {"durationSec": 601, "pages": [{"n": 1, "text": "long video", "startSec": 0}]}
    out = make_client(FakeGemini(overrides={"video_text": raw})).post("/v1/video/text", json={"url": "https://youtu.be/abc"}).json()
    assert "startSec" not in out["pages"][0] and out["approximateTimestamps"] is False


def test_video_url_must_be_youtube(client):
    for url in ("https://example.com/v", "ftp://youtube.com/x", "not a url", "https://evil-youtube.com/x"):
        assert client.post("/v1/video/text", json={"url": url}).status_code == 400


MODS = [{"id": "m_backprop", "path": "Neural Networks / Midterm / Backpropagation"}, {"id": "m_other", "path": "Databases"}]


def suggest(client, mods=MODS):
    return client.post("/v1/suggest-module", json={"title": "Backprop notes", "snippet": "chain rule", "modules": mods}).json()


def test_suggest_picks_the_fixture_module(client):
    assert suggest(client) == {"moduleId": "m_backprop", "confidence": 0.9}


def test_suggest_returns_null_below_threshold(make_client):
    c = make_client(FakeGemini(overrides={"suggest_module": {"moduleId": "m_backprop", "confidence": 0.3}}))
    assert suggest(c)["moduleId"] is None


def test_suggest_never_returns_an_id_that_was_not_offered(make_client):
    c = make_client(FakeGemini(overrides={"suggest_module": {"moduleId": "m_invented", "confidence": 0.99}}))
    assert suggest(c) == {"moduleId": None, "confidence": 0.0}
    assert suggest(c, mods=[]) == {"moduleId": None, "confidence": 0.0}
