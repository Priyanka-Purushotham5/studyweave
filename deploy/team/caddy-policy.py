#!/usr/bin/env python3
"""Fail closed unless Caddy's adapted routes enforce the reviewed session policy."""
import json
import subprocess
import sys


def require(condition):
    if not condition: raise ValueError('Caddy session policy is not the reviewed configuration')

def inner(route):
    handles = route.get('handle', [])
    require(len(handles) == 1 and handles[0].get('handler') == 'subroute')
    return handles[0].get('routes', [])

def handlers(route):
    result = []
    for block in inner(route):
        require(not block.get('match'))
        result += block.get('handle', [])
    return result

def validate(config):
    servers = config['apps']['http']['servers']
    require(len(servers) == 1)
    server = next(iter(servers.values()))
    require(set(server) == {'listen', 'routes'} and server['listen'] == [':443'])
    routes = server['routes']
    require(len(routes) == 2)
    sites = {}
    for route in routes:
        match = route.get('match', [])
        require(len(match) == 1 and set(match[0]) == {'host'} and len(match[0]['host']) == 1 and route.get('terminal') is True)
        sites[match[0]['host'][0]] = route
    require(set(sites) == {'studynova.ink', 'api.studynova.ink'})
    api = handlers(sites['api.studynova.ink'])
    require([h.get('handler') for h in api] in (['static_response'], ['encode', 'static_response']))
    require(api[-1].get('status_code') in (404, '404'))
    blocks = inner(sites['studynova.ink'])
    require(len(blocks) == 2)
    require(blocks[0].get('match') == [{'path': ['/login', '/auth/login', '/auth/logout']}])
    require(not blocks[1].get('match'))
    login = handlers(blocks[0])
    require(len(login) == 1 and login[0].get('handler') == 'reverse_proxy' and login[0].get('upstreams') == [{'dial': '127.0.0.1:3009'}])
    require(set(login[0]) == {'handler', 'headers', 'upstreams'})
    protected = handlers(blocks[1])
    require(len(protected) == 2 and all(h.get('handler') == 'reverse_proxy' for h in protected))
    auth, app = protected
    require(set(auth) == {'handle_response', 'handler', 'headers', 'rewrite', 'upstreams'})
    require(set(app) == {'handler', 'upstreams'})
    require(auth.get('upstreams') == [{'dial': '127.0.0.1:3009'}] and auth.get('rewrite') == {'method': 'GET', 'uri': '/auth/check'})
    require(app.get('upstreams') == [{'dial': '127.0.0.1:3007'}])
    require(len(auth.get('handle_response', [])) == 1 and auth['handle_response'][0].get('match') == {'status_code': [2]})
    require(auth['handle_response'][0].get('routes') == [{'handle': [{'handler': 'vars'}]}])
    header = auth.get('headers', {}).get('request', {}).get('set', {})
    require(header == {'X-Forwarded-Method': ['{http.request.method}'], 'X-Forwarded-Uri': ['{http.request.uri}'], 'X-Real-Ip': ['{http.request.remote.host}']})
    require(set(auth.get('headers', {})) == {'request'} and set(auth['headers']['request']) == {'set'})
    login_header = login[0].get('headers', {}).get('request', {}).get('set', {})
    require(login_header == {'X-Real-Ip': ['{http.request.remote.host}']})
    require(set(login[0].get('headers', {})) == {'request'} and set(login[0]['headers']['request']) == {'set'})

if __name__ == '__main__':
    try:
        adapted = subprocess.run(['caddy', 'adapt', '--config', sys.argv[1], '--adapter', 'caddyfile'], check=True, capture_output=True, text=True)
        validate(json.loads(adapted.stdout))
        print('PASS Caddy session policy')
    except Exception:
        # Do not print adapted configuration or its contents.
        print('FAIL Caddy session policy', file=sys.stderr)
        sys.exit(1)
