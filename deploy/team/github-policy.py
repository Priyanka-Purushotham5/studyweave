#!/usr/bin/env python3
"""Independent server-side check of protected main and its successful CI."""
import json
import re
import sys
import urllib.request

BASE = 'https://api.github.com/repos/Priyanka-Purushotham5/studyweave'
REQUIRED = {'auth-service', 'ai-service', 'api', 'contracts', 'web', 'deploy-policy'}
GITHUB_ACTIONS_APP_ID = 15368
def get(path):
    request = urllib.request.Request(BASE + path, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'studynova-deploy'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)
def check(sha):
    if not re.fullmatch(r'[0-9a-f]{40}', sha): raise ValueError('Invalid SHA')
    branch = get('/branches/main')
    if not branch.get('protected') or branch.get('commit', {}).get('sha') != sha: raise ValueError('Not the protected main tip')
    policy = branch.get('protection', {}).get('required_status_checks') or {}
    contexts = set(policy.get('contexts') or []) | {x['context'] for x in policy.get('checks') or []}
    if not REQUIRED.issubset(contexts): raise ValueError('Missing required CI policy')
    bound = {c['context']: c.get('app_id') for c in policy.get('checks') or []}
    if any(bound.get(n) != GITHUB_ACTIONS_APP_ID for n in REQUIRED): raise ValueError('Required checks are not bound to GitHub Actions')
    runs = get(f'/actions/workflows/ci.yml/runs?head_sha={sha}&event=push&per_page=20').get('workflow_runs', [])
    if not runs or runs[0]['status'] != 'completed' or runs[0]['conclusion'] != 'success': raise ValueError('Main CI has not passed')
    result = get(f'/commits/{sha}/check-runs?per_page=100')
    if result.get('total_count', 0) > 100: raise ValueError('Too many checks to verify safely')
    latest = {}
    for item in result.get('check_runs', []):
        n = item.get('name')
        if n in contexts and (n not in latest or item.get('id', 0) > latest[n].get('id', 0)): latest[n] = item
    for name in contexts:
        item = latest.get(name, {})
        if item.get('status') != 'completed' or item.get('conclusion') != 'success': raise ValueError('A required check has not passed: ' + name)
        if name in REQUIRED and (item.get('app') or {}).get('id') != GITHUB_ACTIONS_APP_ID: raise ValueError('Unexpected check provider: ' + name)
if __name__ == '__main__':
    try:
        check(sys.argv[1])
        print('PASS protected main and CI')
    except Exception as error:
        print('Deployment blocked by GitHub policy:', str(error), file=sys.stderr)
        sys.exit(1)
