#!/usr/bin/env python3
"""Interactively store a shared team password hash without echoing it."""
import getpass
import grp
import os
from pathlib import Path
import re
import subprocess
import tempfile

if os.geteuid() != 0:
    raise SystemExit("Run this script as root on the StudyNova server.")
user = input("Team username: ").strip()
if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", user):
    raise SystemExit("Use 1–64 letters, digits, dots, underscores or hyphens for the username.")
password = getpass.getpass("Team password (at least 12 characters): ")
if len(password) < 12 or password != getpass.getpass("Confirm team password: "):
    raise SystemExit("Password is too short or does not match.")
result = subprocess.run(["caddy", "hash-password", "--algorithm", "bcrypt"], input=password + "\n", text=True,
                        check=True, capture_output=True)
hash_value = result.stdout.strip()
if not hash_value.startswith(("$2a$", "$2b$", "$2y$")):
    raise SystemExit("Caddy did not produce a bcrypt hash; no files were changed.")
caddy_group = grp.getgrnam("caddy").gr_gid

def replace_file(path, contents, mode, gid):
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".studynova-")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(contents)
        os.chown(tmp, 0, gid)
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)

replace_file(Path("/etc/caddy/studynova-team-auth.caddy"), user + " " + hash_value + "\n", 0o640, caddy_group)
print("Team login saved. Running services have not been changed.")
