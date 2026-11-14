"""Integration test I1 from A's side: everything A returns validates against contracts/schemas.json."""
import json
import pathlib
import subprocess
import sys

import pytest
from jsonschema import Draft202012Validator

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCHEMAS = json.loads((ROOT / "contracts" / "schemas.json").read_text(encoding="utf-8"))


def validate(name: str, instance) -> None:
    wrapper = {"$schema": SCHEMAS["$schema"], "$defs": SCHEMAS["$defs"], "$ref": f"#/$defs/{name}"}
    errors = list(Draft202012Validator(wrapper).iter_errors(instance))
    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors]


def pages_rp(pages):
    return pages


def test_fixture_check_script_passes():
    r = subprocess.run([sys.executable, str(ROOT / "contracts" / "validate.py")], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


def test_fixture_check_script_catches_a_corrupted_fixture(tmp_path):
    """Copy the repo pieces, break one quote, expect failure."""
    import shutil
    for d in ("contracts", "fixtures", "ai-service"):
        shutil.copytree(ROOT / d, tmp_path / d, ignore=shutil.ignore_patterns(".venv", "__pycache__", ".pytest_cache"))
    graph = tmp_path / "fixtures" / "graph.json"
    graph.write_text(graph.read_text().replace("composite function by multiplying", "composite function by dividing"))
    r = subprocess.run([sys.executable, str(tmp_path / "contracts" / "validate.py")], capture_output=True, text=True)
    assert r.returncode == 1 and "quote not on" in r.stdout


def test_every_schema_def_used_in_fixture_map_exists():
    for name in json.loads((ROOT / "contracts" / "fixtures.map.json").read_text()).values():
        assert name in SCHEMAS["$defs"]


def test_a_endpoint_responses_match_schemas(client, graph, pages):
    import io
    from tests.helpers import make_pdf
    validate("GlossaryResponse", client.post("/v1/glossary", json={"pages": [{"n": 1, "text": "x"}]}).json())
    validate("ConceptsExtractResponse", client.post("/v1/concepts/extract", json={"moduleId": "m", "pages": pages}).json())
    validate("EmbedResponse", client.post("/v1/embed", json={"texts": ["a", "b"]}).json())
    nodes = {n["id"]: n for n in graph["nodes"]}
    prs = [{"a": nodes["c_chain_rule"], "b": nodes["c_backpropagation"]}, {"a": nodes["c_activation_functions"], "b": nodes["c_gradient_descent"]}]
    validate("EdgesTypeResponse", client.post("/v1/edges/type", json={"pairs": prs, "pages": pages}).json())
    for kind in ("mcq", "conceptual"):
        body = {"concept": nodes["c_chain_rule"], "pages": pages, "kind": kind, "n": 3}
        validate("QuestionsGenerateResponse", client.post("/v1/questions/generate", json=body).json())
    validate("AnswerResponse", client.post("/v1/answer", json={"question": "q", "pages": pages}).json())
    validate("AnswerResponse", client.post("/v1/answer", json={"kind": "summary", "pages": pages}).json())
    validate("PapersTagResponse", client.post("/v1/papers/tag", json={"pages": [{"n": 1, "text": "p"}], "concepts": ["Chain rule"]}).json())
    validate("VideoTextResponse", client.post("/v1/video/text", json={"url": "https://youtu.be/x"}).json())
    validate("SuggestModuleResponse", client.post("/v1/suggest-module", json={"title": "t", "snippet": "s", "modules": [{"id": "m_backprop", "path": "p"}]}).json())
    validate("ParseResponse", client.post("/v1/parse", files={"file": ("a.pdf", make_pdf(["hello"]), "application/pdf")}).json())
    validate("TranscribeResponse", client.post("/v1/transcribe", files={"file": ("a.mp3", b"x", "audio/mpeg")}).json())


def test_flag_response_and_request_shapes_match_schemas(client):
    lecture = json.loads((ROOT / "fixtures" / "lecture.json").read_text())
    body = {"words": lecture["words"], "glossary": lecture["glossary"]}
    validate("FlagRequest", body)
    out = client.post("/v1/flag", json=body).json()
    validate("FlagResponse", out)
    assert out["flags"] == lecture["flags"]  # fixture flags are what A really produces


def test_error_bodies_match_schema(make_client):
    from app.gemini import FakeGemini
    for code in ("rate_limited", "ai_unavailable", "internal"):
        r = make_client(FakeGemini(fail_with=code)).post("/v1/embed", json={"texts": ["a"]})
        validate("Error", r.json())
