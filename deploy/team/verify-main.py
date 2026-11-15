#!/usr/bin/env python3
"""Fail closed unless this exact main tip is protected and its CI passed."""
import json
import os
import re
import subprocess
import sys

REQUIRED = {'auth-service', 'ai-service', 'api', 'contracts', 'web', 'deploy-policy'}
GITHUB_ACTIONS_APP_ID = 15368

def gh(*args):
    result = subprocess.run(['gh', *args], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)

def verify(sha, branch, runs, checks, rollback=False):
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Commit must be a full lowercase SHA')
    if not branch.get('protected') or branch.get('commit', {}).get('sha') != sha:
        raise ValueError('Commit must be the current protected main tip')
    policy = branch.get('protection', {}).get('required_status_checks') or {}
    contexts = set(policy.get('contexts') or []) | {c['context'] for c in policy.get('checks') or []}
    if not REQUIRED.issubset(contexts):
        raise ValueError('Main must require all StudyNova CI checks')
    bound = {c['context']: c.get('app_id') for c in policy.get('checks') or []}
    if any(bound.get(name) != GITHUB_ACTIONS_APP_ID for name in REQUIRED):
        raise ValueError('StudyNova checks must be bound to the GitHub Actions app')
    if rollback:
        return
    if not runs or runs[0].get('status') != 'completed' or runs[0].get('conclusion') != 'success':
        raise ValueError('Latest push CI workflow for the commit has not passed')
    latest = {}
    for check in checks:
        name = check.get('name')
        if name in contexts and (name not in latest or check.get('id', 0) > latest[name].get('id', 0)):
            latest[name] = check
    for context in contexts:
        result = latest.get(context)
        if not result or result.get('status') != 'completed' or result.get('conclusion') != 'success':
            raise ValueError(f'Required check is missing or failed: {context}')
        if context in REQUIRED and (result.get('app') or {}).get('id') != GITHUB_ACTIONS_APP_ID:
            raise ValueError(f'Unexpected check provider: {context}')

if __name__ == '__main__':
    try:
        if os.environ.get('GITHUB_REF') != 'refs/heads/main':
            raise ValueError('Run this workflow from main')
        repo = os.environ['GITHUB_REPOSITORY']
        sha = sys.argv[1]
        branch = gh('api', f'repos/{repo}/branches/main')
        rollback = len(sys.argv) == 3 and sys.argv[2] == '--rollback'
        runs = [] if rollback else gh('api', f'repos/{repo}/actions/workflows/ci.yml/runs?head_sha={sha}&event=push&per_page=20').get('workflow_runs', [])
        checks = [] if rollback else gh('api', '--paginate', '--slurp', f'repos/{repo}/commits/{sha}/check-runs?per_page=100')
        checks = [c for page in checks for c in page.get('check_runs', [])]
        verify(sha, branch, runs, checks, rollback=rollback)
        print('Verified protected main tip and required CI checks')
    except (KeyError, IndexError, ValueError, subprocess.CalledProcessError) as error:
        print(f'Deployment blocked: {error}', file=sys.stderr)
        sys.exit(1)
