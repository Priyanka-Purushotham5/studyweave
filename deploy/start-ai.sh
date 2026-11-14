#!/bin/sh
set -eu
if [ "${FAKE_GEMINI:-0}" != 1 ] && [ -z "${GEMINI_API_KEY:-}" ]; then
 echo 'Set GEMINI_API_KEY for real AI, or explicitly set FAKE_GEMINI=1 for a key-free demo' >&2
 exit 1
fi
exec uvicorn app.main:app --host 0.0.0.0 --port 8001
