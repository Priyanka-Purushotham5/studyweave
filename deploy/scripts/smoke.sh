#!/usr/bin/env bash
set -euo pipefail
base="${1:?Usage: smoke.sh https://your-domain [moduleId]}"
module="${2:-m_backprop}"
curl_args=(--fail --silent --show-error)
if [[ -n "${CURL_AUTH:-}" ]]; then curl_args+=(--user "$CURL_AUTH"); fi
[[ "$base" == https://* || "${ALLOW_HTTP:-}" == 1 ]] || { echo 'HTTPS URL required'; exit 1; }
curl "${curl_args[@]}" "$base/healthz" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{if(!JSON.parse(s).ok)process.exit(1)})'
curl "${curl_args[@]}" "$base/api/tree" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{if(!Array.isArray(JSON.parse(s)))process.exit(1)})'
for run in 1 2; do
 curl "${curl_args[@]}" "$base/api/questions/next" -H 'Content-Type: application/json' --data "{\"moduleId\":\"$module\",\"n\":1}" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const q=JSON.parse(s).questions;if(!q?.length||q.some(x=>x.verified!==true))process.exit(1)})'
done
if [[ "$base" == https://* ]]; then
 echo 'Smoke checks passed (TLS certificate verified by curl)'
else
 echo 'Smoke checks passed (local HTTP only; TLS not tested)'
fi
