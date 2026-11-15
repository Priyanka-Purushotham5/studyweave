"""Loopback-only StudyNova session gateway, intended to sit behind host Caddy."""
import os
import re
import secrets
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs

import html

import bcrypt
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

COOKIE = '__Host-studynova'
ORIGIN = os.environ.get('AUTH_ORIGIN', 'https://studynova.ink').rstrip('/')
CREDENTIAL_FILE = os.environ.get('AUTH_CREDENTIAL_FILE', '/run/secrets/team-auth')
SESSION_SECONDS = 8 * 60 * 60

# Landing page content. Emails are optional: a member without one shows name and role only.
DEMO_URL = os.environ.get('STUDYNOVA_DEMO_URL', '#how')
TEAM = [
    {'name': 'Priyanka Purushotham', 'role': 'AI service', 'email': 'priyankapurushotham5@gmail.com'},
    {'name': 'Danush Kanchi', 'role': 'API, data and deployment', 'email': 'danushkanchi2001@gmail.com'},
    {'name': 'Rohith Bangalore Vijaya', 'role': 'Web app and Chrome extension', 'email': 'rohitbv.vips@gmail.com'},
]
LANDING = Path(__file__).with_name('landing.html').read_text(encoding='utf-8')
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
sessions = {}
attempts = {}
lock = threading.Lock()


def authenticated(request):
    token = request.cookies.get(COOKIE, '')
    with lock:
        expires = sessions.get(token, 0)
        if expires <= time.time():
            sessions.pop(token, None)
            return False
        return True


def credentials():
    # Same bcrypt hash file currently consumed by host Caddy; no password is persisted.
    parts = Path(CREDENTIAL_FILE).read_text(encoding='utf-8').strip().split()
    if len(parts) != 2 or not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}', parts[0]):
        raise ValueError('Invalid credential file')
    if not re.fullmatch(r'\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}', parts[1]):
        raise ValueError('Invalid password hash')
    return parts[0], parts[1]


def team_html():
    items = []
    for member in TEAM:
        email = html.escape(member.get('email', ''), quote=True)
        link = f'<a href="mailto:{email}">{email}</a>' if email else ''
        items.append(f'<li><strong>{html.escape(member["name"])}</strong><span>{html.escape(member["role"])}</span>{link}</li>')
    return ''.join(items)


def login_html(error=''):
    """Public landing page with the sign-in dialog; the dialog opens on its own after a failed attempt."""
    notice = '<p class="alert" role="alert">Incorrect username or password.</p>' if error else ''
    values = {'{{NOTICE}}': notice, '{{OPEN}}': 'open' if error else '', '{{TEAM}}': team_html(),
              '{{DEMO_URL}}': html.escape(DEMO_URL, quote=True)}
    out = LANDING
    for key, value in values.items():
        out = out.replace(key, value)
    return out


def page(content, status=200):
    return HTMLResponse(content, status_code=status, headers={'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff'})


@app.get('/login')
def login(request: Request):
    if authenticated(request):
        return RedirectResponse('/', status_code=303)
    return page(login_html())


@app.post('/auth/login')
async def submit_login(request: Request):
    if request.headers.get('origin') != ORIGIN:
        return Response(status_code=403)
    # Caddy overwrites this header; the gateway must never be publicly reachable.
    client = request.headers.get('x-real-ip', request.client.host)
    now = time.time()
    with lock:
        # Keep idle entries from accumulating indefinitely on a long-running server.
        for key in [key for key, values in attempts.items() if not values or values[-1] <= now - 60]:
            attempts.pop(key, None)
        if len(attempts) >= 10000 and client not in attempts:
            return Response('Too many attempts. Try again later.', status_code=429, headers={'Retry-After': '60'})
        recent = [t for t in attempts.get(client, []) if t > now - 60]
        if len(recent) >= 10:
            return Response('Too many attempts. Try again later.', status_code=429, headers={'Retry-After': '60'})
        recent.append(now)
        attempts[client] = recent
    body = b''
    async for chunk in request.stream():
        body += chunk
        if len(body) > 4096:
            return Response(status_code=413)
    form = parse_qs(body.decode('utf-8', errors='replace'), keep_blank_values=True)
    user = form.get('username', [''])[0]
    password = form.get('password', [''])[0]
    try:
        expected_user, password_hash = credentials()
        matched = bcrypt.checkpw(password.encode()[:72], password_hash.encode()) and secrets.compare_digest(user.encode(), expected_user.encode())
    except (OSError, ValueError):
        return Response('Sign-in temporarily unavailable.', status_code=503)
    if not matched or len(password.encode()) > 72:
        return page(login_html('invalid'), 401)
    token = secrets.token_urlsafe(32)
    with lock:
        for key in [key for key, expiry in sessions.items() if expiry <= now]:
            sessions.pop(key, None)
        if len(sessions) >= 10000:
            return Response('Sign-in temporarily unavailable.', status_code=503)
        sessions[token] = now + SESSION_SECONDS
        attempts.pop(client, None)
    response = RedirectResponse('/', status_code=303)
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, secure=True, samesite='strict', path='/')
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.post('/auth/logout')
def logout(request: Request):
    if request.headers.get('origin') != ORIGIN:
        return Response(status_code=403)
    with lock:
        sessions.pop(request.cookies.get(COOKIE, ''), None)
    response = RedirectResponse('/login', status_code=303)
    response.delete_cookie(COOKIE, path='/', secure=True, httponly=True, samesite='strict')
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.get('/auth/check')
def check(request: Request):
    method = request.headers.get('x-forwarded-method', '')
    uri = request.headers.get('x-forwarded-uri', '/')
    if not method:
        return Response(status_code=403)
    if not authenticated(request):
        if uri.startswith('/api/') or method not in ('GET', 'HEAD'):
            return JSONResponse({'error': {'code': 'unauthorized', 'message': 'Sign in to StudyNova.'}}, status_code=401)
        return RedirectResponse('/login', status_code=303)
    if method not in ('GET', 'HEAD', 'OPTIONS') and request.headers.get('origin') != ORIGIN:
        return Response(status_code=403)
    return Response(status_code=204)
