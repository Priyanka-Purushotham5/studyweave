# AI service (Module A)

Stateless FastAPI service. The only module that calls Gemini. Everything it returns that carries evidence
has been checked in code: a quote that is not on the cited page is dropped, never served.

## Run it (PowerShell, from this folder, venv active)

    $env:FAKE_GEMINI="1"          # no key needed: serves fixtures/ai_raw
    uvicorn app.main:app --port 8001 --reload

    # real Gemini
    $env:FAKE_GEMINI="0"; $env:GEMINI_API_KEY="..."; uvicorn app.main:app --port 8001

Docs and try-it page: http://localhost:8001/docs

## Test

    pytest -q                 # everything except live tests (no key, no network)
    RUN_LIVE_GEMINI_TESTS=1 pytest -m live  # explicitly opt in; requires GEMINI_API_KEY and approval

## Endpoints

See `../contracts/schemas.json` (the `*Request` / `*Response` defs) and `../contracts/types.ts`.
`/healthz`, `/v1/parse`, `/v1/video/text`, `/v1/glossary`, `/v1/transcribe`, `/v1/flag`, `/v1/concepts/extract`,
`/v1/embed`, `/v1/edges/type`, `/v1/questions/generate`, `/v1/papers/tag`, `/v1/answer`, `/v1/suggest-module`.

## Layout

- `app/gemini.py` real client + `FakeGemini` (every Gemini call goes through here), `app/prompts.py`
- `app/citations.py` quote check, `app/flagging.py` caption flags, `app/numerics.py` double-solve
- `app/endpoints/` one file per endpoint
- `eval/` measurement scripts: `wer`, `wer_gate`, `citation_rate`, `edge_sheet`

## Not yet verified against the live API

`RealGemini` (request shapes, Files API upload for audio over 20 MB, YouTube URL input) is written to the public docs
and unit-tested with a mock transport, but has not been run with a real key. After key, model, quota and cost approval, explicitly opt in with `RUN_LIVE_GEMINI_TESTS=1 pytest -m live` and run `python -m eval.wer_gate`.
