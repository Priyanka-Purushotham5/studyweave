import socket

import pytest


def test_offline_tests_reject_external_dns_and_connections():
    with pytest.raises(RuntimeError, match="External network access"):
        socket.getaddrinfo("generativelanguage.googleapis.com", 443)
    with socket.socket() as sock, pytest.raises(RuntimeError, match="External network access"):
        sock.connect(("8.8.8.8", 443))
