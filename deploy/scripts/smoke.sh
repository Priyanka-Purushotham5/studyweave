#!/usr/bin/env bash
set -euo pipefail
base="${1:?Usage: smoke.sh https://your-domain [moduleId]}"
module="${2:-m_backprop}"
curl_args=(--fail --silent --show-error --connect-timeout 10 --max-time 30)
if [[ -n "${CURL_AUTH:-}" ]]; then curl_args+=(--user "$CURL_AUTH"); fi
[[ "$base" == https://* || "${ALLOW_HTTP:-}" == 1 ]] || { echo 'HTTPS URL required'; exit 1; }
curl "${curl_args[@]}" "$base/healthz" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{if(!JSON.parse(s).ok)process.exit(1)})'
curl "${curl_args[@]}" "$base/api/tree" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{if(!Array.isArray(JSON.parse(s)))process.exit(1)})'
payload=$(node -e 'process.stdout.write(JSON.stringify({moduleId:process.argv[1],n:1}))' "$module")
question_id=''
for run in 1 2; do
 current=$(curl "${curl_args[@]}" "$base/api/questions/next" -H 'Content-Type: application/json' --data "$payload" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const q=JSON.parse(s).questions;if(!q?.length||q.some(x=>x.verified!==true||!x.citations?.length))process.exit(1);process.stdout.write(q[0].id)})')
 if [[ "$run" == 2 && "$current" != "$question_id" ]]; then echo 'Stored question was not reused' >&2; exit 1; fi
 question_id="$current"
done
if [[ "$base" == https://* ]]; then
 echo 'Smoke checks passed (TLS certificate verified by curl)'
else
 echo 'Smoke checks passed (local HTTP only; TLS not tested)'
fi
