import ipaddress
import json
import pathlib
import socket

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


@pytest.fixture(autouse=True)
def block_external_network_for_offline_tests(request, monkeypatch):
    """Keep ordinary tests offline, even when credentials exist in the shell."""
    # Live tests are separately guarded by their explicit opt-in and key check.
    if request.node.get_closest_marker("live"):
        return

    original_connect = socket.socket.connect
    original_connect_ex = socket.socket.connect_ex
    original_getaddrinfo = socket.getaddrinfo

    def check_address(address):
        if not isinstance(address, tuple):  # Unix-domain socket
            return
        host = address[0]
        try:
            local = ipaddress.ip_address(host).is_loopback
        except ValueError:
            local = host.lower() == "localhost"
        if not local:
            raise RuntimeError("External network access is disabled in offline AI tests")

    def connect(sock, address):
        check_address(address)
        return original_connect(sock, address)

    def connect_ex(sock, address):
        check_address(address)
        return original_connect_ex(sock, address)

    def getaddrinfo(host, *args, **kwargs):
        if host is not None:
            check_address((host, 0))
        return original_getaddrinfo(host, *args, **kwargs)

    monkeypatch.setattr(socket.socket, "connect", connect)
    monkeypatch.setattr(socket.socket, "connect_ex", connect_ex)
    monkeypatch.setattr(socket, "getaddrinfo", getaddrinfo)
