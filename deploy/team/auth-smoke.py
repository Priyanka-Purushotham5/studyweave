#!/usr/bin/env python3
"""Read-only authenticated smoke; credentials stay in a root-only server file."""
import http.client
import json
import os
import stat
import sys
import urllib.parse


def call(method, route, data=None, headers=None, host='studynova.ink'):
    conn = http.client.HTTPSConnection(host, timeout=15)
    conn.request(method, route, body=data, headers=headers or {})
    response = conn.getresponse()
    response.read()
    status, cookie = response.status, response.getheader('Set-Cookie', '')
    conn.close()
    return status, cookie


def require(condition):
    if not condition:
        raise ValueError('Security smoke check failed')


def smoke(cred, send=call):
    origin = 'https://studynova.ink'
    require(send('GET', '/login')[0] == 200)
    require(send('GET', '/api/tree')[0] == 401)
    require(send('GET', '/api/tree', host='api.studynova.ink')[0] == 404)
    data = urllib.parse.urlencode({'username': cred['username'], 'password': cred['password']})
    status, cookie = send('POST', '/auth/login', data, {'Origin': origin, 'Content-Type': 'application/x-www-form-urlencoded'})
    require(status == 303 and all(flag in cookie.lower() for flag in ('secure', 'httponly', 'samesite=strict', 'path=/')))
    session = cookie.split(';', 1)[0]
    require(send('GET', '/api/tree', headers={'Cookie': session})[0] == 200)
    require(send('POST', '/api/resources', '{}', {'Cookie': session, 'Origin': 'https://invalid.example', 'Content-Type': 'application/json'})[0] == 403)
    require(send('POST', '/auth/logout', headers={'Cookie': session, 'Origin': origin})[0] == 303)
    require(send('GET', '/api/tree', headers={'Cookie': session})[0] == 401)


if __name__ == '__main__':
    try:
        path = '/etc/studynova/smoke-credentials.json'
        mode = os.stat(path)
        if mode.st_uid != 0 or stat.S_IMODE(mode.st_mode) != 0o600:
            raise ValueError('Smoke credential file must be root-owned and mode 0600')
        with open(path, encoding='utf-8') as file:
            credentials = json.load(file)
        smoke(credentials)
        print('PASS HTTPS session, API authorization, CSRF and logout')
    except Exception:
        # Do not print exception data that might contain credentials or cookies.
        print('FAIL authenticated production smoke', file=sys.stderr)
        sys.exit(1)
