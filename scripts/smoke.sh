#!/usr/bin/env bash
set -euo pipefail
# Canonical implementation remains owned by Module B under deploy/.
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/deploy/scripts/smoke.sh" "$@"
