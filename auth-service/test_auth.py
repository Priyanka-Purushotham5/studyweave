import importlib.util
from pathlib import Path
import time

import bcrypt
import pytest
from fastapi.testclient import TestClient

spec = importlib.util.spec_from_file_location('studynova_auth', Path(__file__).with_name('app.py'))
auth = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auth)
ORIGIN = 'https://studynova.ink'

@pytest.fixture
def setup_auth(tmp_path, monkeypatch):
    password_hash = bcrypt.hashpw(b'test-password-only', bcrypt.gensalt(rounds=4)).decode()
    cred = tmp_path / 'auth'
    cred.write_text('team ' + password_hash + '\n')
    monkeypatch.setattr(auth, 'CREDENTIAL_FILE', str(cred))
    auth.sessions.clear()
    auth.attempts.clear()
    return TestClient(auth.app, base_url=ORIGIN, follow_redirects=False)


def sign_in(client, password='test-password-only'):
    return client.post('/auth/login', headers={'Origin': ORIGIN}, data={'username': 'team', 'password': password})


def check(client, method='GET', uri='/api/tree', origin=None):
    headers = {'X-Forwarded-Method': method, 'X-Forwarded-Uri': uri}
    if origin:
        headers['Origin'] = origin
    return client.get('/auth/check', headers=headers)


def test_login_session_logout_and_api_gate(setup_auth):
    c = setup_auth
    assert c.get('/login').status_code == 200
    assert check(c).status_code == 401
    assert check(c, uri='/').status_code == 303
    assert sign_in(c, 'wrong').status_code == 401
    r = sign_in(c)
    assert r.status_code == 303
    cookie = r.headers['set-cookie'].lower()
    assert all(x in cookie for x in ['secure', 'httponly', 'samesite=strict', 'path=/'])
    assert check(c).status_code == 204
    assert check(c).status_code == 204  # refresh retains server-side session
    assert check(c, 'POST', '/api/resources', ORIGIN).status_code == 204
    assert check(c, 'POST', '/api/resources', 'https://evil.example').status_code == 403
    assert check(c, 'POST', '/api/resources').status_code == 403
    assert c.post('/auth/logout', headers={'Origin': 'https://evil.example'}).status_code == 403
    assert c.post('/auth/logout', headers={'Origin': ORIGIN}).status_code == 303
    assert check(c).status_code == 401


def test_three_independent_logins_and_session_expiry(setup_auth):
    clients = [TestClient(auth.app, base_url=ORIGIN, follow_redirects=False) for _ in range(3)]
    for c in clients:
        assert sign_in(c).status_code == 303
        assert check(c).status_code == 204
    token = clients[0].cookies.get(auth.COOKIE)
    auth.sessions[token] = time.time() - 1
    assert check(clients[0]).status_code == 401
    assert check(clients[1]).status_code == 204
    assert check(clients[2]).status_code == 204


def test_login_csrf_rate_limit_and_fail_closed(setup_auth, monkeypatch):
    c = setup_auth
    assert c.post('/auth/login', data={'username': 'team', 'password': 'test-password-only'}).status_code == 403
    for _ in range(10):
        assert sign_in(c, 'wrong').status_code == 401
    assert sign_in(c).status_code == 429
    auth.attempts.clear()
    monkeypatch.setattr(auth, 'CREDENTIAL_FILE', '/does/not/exist')
    assert sign_in(c).status_code == 503
    assert check(c).status_code == 401


def test_landing_page_is_public_static_and_complete(setup_auth):
    r = setup_auth.get('/login')
    body = r.text
    assert r.status_code == 200 and "default-src 'none'" in r.headers['content-security-policy']
    assert '<script' not in body.lower() and '{{' not in body
    assert 'action="/auth/login"' in body and 'href="#signin"' in body
    assert 'HackUMass XIV' in body and all(member['name'] in body for member in auth.TEAM)
    assert 'class="signin "' in body  # dialog closed until the visitor asks for it


def test_failed_sign_in_reopens_dialog_with_message(setup_auth):
    r = sign_in(setup_auth, 'wrong')
    assert r.status_code == 401
    assert 'class="signin open"' in r.text and 'Incorrect username or password.' in r.text


def test_team_email_is_escaped_and_optional(monkeypatch):
    monkeypatch.setattr(auth, 'TEAM', [{'name': 'A<b>', 'role': 'r', 'email': 'a"b@x.edu'}, {'name': 'B', 'role': 'r', 'email': ''}])
    out = auth.team_html()
    assert 'A&lt;b&gt;' in out and 'mailto:a&quot;b@x.edu' in out and out.count('mailto:') == 1
