# How to call the AI service (A)

Start it with no key: `cd ai-service`, `$env:FAKE_GEMINI="1"`, `uvicorn app.main:app --port 8001` (PowerShell), or
`docker build -f ai-service/Dockerfile -t studyweave-ai .` then `docker run --rm -p 8001:8001 -e FAKE_GEMINI=1 studyweave-ai`.
Try-it page: http://localhost:8001/docs. Shapes: `contracts/schemas.json` (`<Endpoint>Request` / `<Endpoint>Response`).
In fake mode the answers come from `fixtures/ai_raw/`, so they always match `fixtures/graph.json` and the demo pages.
Examples use `curl.exe` on Windows PowerShell; in the JSON, escape quotes with a file: `curl.exe ... -d "@body.json"`.

## Rules that never change
- Errors always look like `{"error":{"code","message"}}`: bad_request 400, scanned_pdf 422, not_found 404, rate_limited 429, ai_unavailable 503, internal 500.
- Anything with evidence has been checked: a quote not on the cited page is dropped. `dropped` says how many.
- Concept id is `c_` + snake_case(name). Edge types: prerequisite, extends, contrasts. `startIdx` inclusive, `endIdx` exclusive.

## Calls

Health: `curl.exe http://localhost:8001/healthz` gives `{"ok":true}`.

Parse a PDF or PPTX (A returns pages; a scanned PDF gives 422 `scanned_pdf`):
`curl.exe -F "file=@fixtures/files/sample.pdf" http://localhost:8001/v1/parse`

Glossary from pages: `POST /v1/glossary` body `{"pages":[{"n":1,"text":"..."}]}` gives `{"terms":[{"term","definition"}]}`.

Concepts: `POST /v1/concepts/extract` body `{"moduleId":"m_backprop","pages":[{"resourceId":"r1","n":1,"text":"..."}]}`
gives `{"concepts":[{"name","definition","evidence":[...]}],"dropped":1}`. B turns each name into an id.

Embeddings: `POST /v1/embed` body `{"texts":["Chain rule","Backpropagation"]}` gives `{"vectors":[[768 numbers],[...]]}`. Over 100 texts is fine; A batches.

Edges for candidate pairs (B sends the pages too so A can verify both quotes):
`POST /v1/edges/type` body `{"pairs":[{"a":<Concept>,"b":<Concept>}],"pages":[<ResourcePage>]}`
gives `{"edges":[<Edge or null>, ...]}`, one entry per pair in order. `null` means no verified edge: do not store it.

Questions: `POST /v1/questions/generate` body `{"concept":<Concept>,"pages":[...],"kind":"mcq","n":3}` (kind: mcq, conceptual, numerical, past_paper)
gives `{"questions":[<Question>],"dropped":1}`; `"refused":true` with an empty list means the pages do not support that concept.
Every question has `difficulty` 1 to 3 and a verified citation.

Past paper tagging: `POST /v1/papers/tag` body `{"pages":[...],"concepts":["Chain rule", ...]}` gives `{"questions":[{"text","concepts":[names from your list]}]}`. B turns the counts into exam weights.

Ask or summarize: `POST /v1/answer` body `{"question":"...","pages":[<ResourcePage>]}` or `{"kind":"summary"|"formula_sheet","pages":[...]}`.
Answer is `{"answer","citations"}` or `{"refused":true,"reason":"not_in_materials"}`. Show the refusal to the student as "not in your materials".

Lecture audio: `curl.exe -F "file=@lecture.mp3" -F "glossary=[\"Backpropagation\"]" -F "hints=[]" http://localhost:8001/v1/transcribe`
gives `{"words":[{"w","startSec","endSec"}],"text"}`. `hints` are terms the student corrected twice or more.

Caption flags: `POST /v1/flag` body `{"words":[...],"glossary":[{term,definition}],"corrections":[{"heard","correct","count"}]}`
gives `{"flags":[...],"autoFixed":[{"startIdx","endIdx","to"}]}`.

YouTube text: `POST /v1/video/text` body `{"url":"https://www.youtube.com/watch?v=..."}` gives pages; `startSec` appears only for videos of 10 minutes or less, and `approximateTimestamps` is then true.

Smart Save: `POST /v1/suggest-module` body `{"title","snippet","modules":[{"id","path"}]}` gives `{"moduleId":<an offered id or null>,"confidence":0..1}`.

## Failure drill
`FakeGemini(fail_with="rate_limited")` (in Python tests) makes every call return that error. B should retry 429 with backoff, then return 503 `ai_unavailable` to the browser.
