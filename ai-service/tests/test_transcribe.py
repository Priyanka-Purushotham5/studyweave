import json

from app.gemini import FakeGemini


def post(client, audio=b"fake-audio", glossary=None, hints=None, ctype="audio/mpeg"):
    return client.post(
        "/v1/transcribe",
        files={"file": ("lecture.mp3", audio, ctype)},
        data={"glossary": json.dumps(glossary or []), "hints": json.dumps(hints or [])},
    )


def test_returns_words_with_timestamps_in_order_and_joined_text(client):
    out = post(client).json()
    starts = [w["startSec"] for w in out["words"]]
    assert starts == sorted(starts) and len(starts) > 5
    assert out["text"] == " ".join(w["w"] for w in out["words"])


def test_glossary_and_hints_are_passed_through(client, fake):
    post(client, glossary=["Backpropagation", {"term": "ReLU", "definition": "x"}], hints=["gradient descent"])
    call = next(d for m, d in fake.calls if m == "transcribe")
    assert call["glossary"] == ["Backpropagation", "ReLU"] and call["hints"] == ["gradient descent"]
    assert call["mime"] == "audio/mpeg"


def test_small_audio_goes_inline_and_over_20mb_takes_files_path(client, fake):
    post(client, audio=b"x" * 1000)
    post(client, audio=b"x" * (20 * 1024 * 1024 + 1))
    paths = [d["path"] for m, d in fake.calls if m == "transcribe"]
    assert paths == ["inline", "files"]


def test_out_of_order_and_malformed_words_are_cleaned(make_client):
    raw = {"words": [{"w": "b", "startSec": 2, "endSec": 2.5}, {"w": "a", "startSec": 1, "endSec": 1.5},
                     {"w": "", "startSec": 3, "endSec": 3.5}, {"w": "bad", "startSec": "x", "endSec": 1}, "junk"]}
    out = post(make_client(FakeGemini(overrides={"transcribe": raw}))).json()
    assert [w["w"] for w in out["words"]] == ["a", "b"] and out["text"] == "a b"


def test_empty_audio_and_bad_json_fields_are_400(client):
    assert post(client, audio=b"").status_code == 400
    r = client.post("/v1/transcribe", files={"file": ("a.mp3", b"x", "audio/mpeg")}, data={"glossary": "not json"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_request"
