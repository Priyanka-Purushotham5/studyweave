#!/usr/bin/env python3
"""Run interactively as root; never echo or transmit credentials to GitHub."""
import getpass
import json
import os
from pathlib import Path
import tempfile

if os.geteuid() != 0:
    raise SystemExit('Run as root on the existing server')
username = input('Shared StudyNova username: ')
password = getpass.getpass('Shared StudyNova password (hidden): ')
if not username or not password:
    raise SystemExit('Both fields are required')
directory = Path('/etc/studynova')
directory.mkdir(mode=0o700, exist_ok=True)
os.chmod(directory, 0o700)
fd, name = tempfile.mkstemp(prefix='.smoke-', dir=directory)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump({'username': username, 'password': password}, f)
    os.replace(name, directory / 'smoke-credentials.json')
finally:
    if os.path.exists(name): os.unlink(name)
print('Smoke credentials stored locally for automated verification.')
