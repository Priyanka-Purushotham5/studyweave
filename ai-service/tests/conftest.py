import json
import pathlib

import pytest
from fastapi.testclient import TestClient

from app.gemini import FakeGemini, get_gemini
from app.main import app

FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "fixtures"


def load_fixture(rel: str):
    return json.loads((FIXTURES / rel).read_text(encoding="utf-8"))


@pytest.fixture
def pages():
    """Page text of resource r1 in ResourcePage shape."""
    return load_fixture("pages.json")["pages"]


@pytest.fixture
def graph():
    return load_fixture("graph.json")


@pytest.fixture
def make_client():
    """make_client(fake) -> TestClient whose Gemini is the given fake."""
    def _make(fake: FakeGemini) -> TestClient:
        app.dependency_overrides[get_gemini] = lambda: fake
        return TestClient(app, raise_server_exceptions=False)
    yield _make
    app.dependency_overrides.clear()


@pytest.fixture
def fake():
    return FakeGemini()


@pytest.fixture
def client(make_client, fake):
    return make_client(fake)
