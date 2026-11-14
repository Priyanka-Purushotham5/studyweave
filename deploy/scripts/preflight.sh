#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
config="${1:-$root/deploy/.env}"
[[ -f "$config" ]] || { echo "Create deploy/.env from deploy/.env.example and fill your private settings" >&2; exit 1; }
docker compose --env-file "$config" -f "$root/deploy/docker-compose.yml" config --format json | node "$root/deploy/scripts/check-compose.mjs"
docker info --format '{{.ServerVersion}}' >/dev/null
echo 'Docker engine is reachable'
