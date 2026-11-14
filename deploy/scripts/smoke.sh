#!/usr/bin/env bash
set -euo pipefail
base="${1:?Usage: smoke.sh https://your-domain [moduleId]}"
module="${2:-m_backprop}"
[[ "$base" == https://* || "${ALLOW_HTTP:-}" == 1 ]] || { echo 'HTTPS URL required'; exit 1; }
curl --fail --silent --show-error "$base/healthz" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{if(!JSON.parse(s).ok)process.exit(1)})'
curl --fail --silent --show-error "$base/api/tree" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{if(!Array.isArray(JSON.parse(s)))process.exit(1)})'
for run in 1 2; do
 curl --fail --silent --show-error "$base/api/questions/next" -H 'Content-Type: application/json' --data "{\"moduleId\":\"$module\",\"n\":1}" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const q=JSON.parse(s).questions;if(!q?.length||q.some(x=>x.verified!==true))process.exit(1)})'
done
if [[ "$base" == https://* ]]; then
 echo 'Smoke checks passed (TLS certificate verified by curl)'
else
 echo 'Smoke checks passed (local HTTP only; TLS not tested)'
fi
