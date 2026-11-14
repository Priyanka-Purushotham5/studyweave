# StudyWeave 3.0 Module B

Node 20.19+ / TypeScript / Express / MongoDB. Module A, shared contracts and shared fixtures are integrated from team main. Module B implementation is in `api/`, `deploy/`, and CI. Module B uses no Gemini SDK, endpoint, or key. Deployment passes `GEMINI_API_KEY` only to Module A.

## Run locally

Local MongoDB + FakeAiClient needs **no credentials**. Install Node 20.19+ and MongoDB 7. **[YOUR CREDENTIALS REQUIRED: Atlas database URI/password]** if you use Atlas instead. From the repository root:

```sh
cd api
npm ci
cp .env.example .env
# [YOUR CREDENTIALS REQUIRED only for Atlas] Set MONGODB_URI to your Atlas URI.
# Local MongoDB at localhost:27017 needs no credentials.
set -a
. ./.env
set +a
npm run build
npm run seed
npm run dev
```

The API listens on port 3000. `AI_MODE=fake` requires no AI service or API key. **[YOUR CREDENTIALS REQUIRED: Gemini API key in Module A]** For real Module A, set `AI_MODE=http` and `AI_SERVICE_URL=http://localhost:8001`, then restart. Fake parsing deliberately returns the three demo pages; it does not parse real documents. Real PDF/PPTX/YouTube extraction and audio transcription require Module A.

```sh
curl http://localhost:3000/healthz
curl http://localhost:3000/api/tree
curl 'http://localhost:3000/api/graph?subjectId=s_nn'
curl http://localhost:3000/api/questions/next \
  -H 'Content-Type: application/json' \
  -d '{"moduleId":"m_backprop","conceptId":"c_chain_rule","difficulty":1,"n":1}'
```

MongoDB persists hierarchy, pages, concepts, embeddings, edges, questions, attempts, readiness, lectures, corrections, job states, and TTL AI cache. GridFS retains original document/audio bytes. MongoDB indexes are created at startup. `/healthz` is liveness; `/readyz` pings MongoDB.

## Start the merged A+B stack without keys

No credentials are required for local MongoDB plus fake-mode Module A:

```sh
# From repository root, first terminal:
python3.11 -m venv .venv
.venv/bin/pip install -r ai-service/requirements.txt
FAKE_GEMINI=1 .venv/bin/uvicorn app.main:app --app-dir ai-service --port 8001

# Second terminal: start your local MongoDB, then:
cd api
npm ci
export MONGODB_URI=mongodb://127.0.0.1:27017
export AI_MODE=http AI_SERVICE_URL=http://127.0.0.1:8001
npm run seed
npm run build
HOST=127.0.0.1 npm start

# Third terminal, from repository root:
AI_INTEGRATION_URL=http://127.0.0.1:8001 npm --prefix api test
ALLOW_HTTP=1 bash scripts/smoke.sh http://localhost:3000
```

The current agent-started demo uses API `127.0.0.1:3000`, A `127.0.0.1:8001`, MongoDB `127.0.0.1:27018`, database `studyweave_demo`, and local data directory `/tmp/studyweave-demo-db`. These are local processes, not a deployed/managed service. No live Gemini inference has been tested.

## Verify

```sh
cd api
npm ci
npm run build
AI_INTEGRATION_URL=http://127.0.0.1:8001 npm test
npm run format:check
npm run eval:trace
npm audit
```

`tests/ai-integration.test.ts` requires a running A service and `AI_INTEGRATION_URL`; without it the actual-service integration tests are explicitly skipped. CI starts fake-mode A automatically. Vitest starts an ephemeral MongoDB 7.0.14 using mongodb-memory-server; the first run downloads its binary. Tests also open loopback HTTP servers, so network/process sandbox permission may be required. No Atlas, Gemini, or production credentials are used. The trace evaluation uses 20 labelled synthetic cases; its hit rate is not a real-world user measurement.

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for B-number coverage, acceptance evidence, decisions, limitations, and the complete changed-file inventory. See [deploy/README.md](../deploy/README.md) for container and HTTPS deployment steps.

## Completion tools and cloud handoff

- `GET /api/openapi.json` serves the complete B OpenAPI 3.1 document, bundling the authoritative shared definitions.
- `GET /api/resources/:id/status` returns the shared JobStatus shape. Resource POST responses include its URL in Location so C can show extraction failures without adding fields to Resource.
- The explicit demo seed adds **labelled synthetic attempt histories** reproducing the shared demo readiness and likely-gap response. It does not alter shared fixture files or represent real learner observations.
- Fresh graph builds include a separate within-module candidate phase; NeighborFinder remains cross-module. Existing IDs stay unchanged and name collisions receive stable module suffixes.
- `node --env-file=api/.env api/dist/checkDatabase.js` checks a saved database connection and normal indexes without printing its URI.
- `node --env-file=api/.env api/dist/setupVector.js` creates/reuses the Atlas vector index and waits for queryability. Unsupported tiers stay on cosine; no paid upgrade is attempted.
- Follow [CLOUD_SETUP.md](../deploy/CLOUD_SETUP.md) for the Atlas → checks → approved Vultr → public TLS sequence. **YOUR ACCOUNT/CREDENTIALS REQUIRED** at the marked steps; do not paste secrets into chat.

## Shared contracts and review

`../contracts/schemas.json` is authoritative; AJV 2020-12 validates the merged shared request/response definitions. B's default seed and FakeAiClient read `../fixtures/`. Shared files and Module A source are unchanged. [CONTRACT_REVIEW.md](CONTRACT_REVIEW.md) records missing B endpoint definitions and decisions to agree with Priyanka/Rohit. Local B schemas cover only endpoints not yet defined by the shared contracts.

`GET /api/tree` returns `{subjects:[...]}`. Trace paths run from the missed concept to the root and carry one Evidence object. Public resources/jobs/lectures exclude database metadata. QuestionsNext accepts n from 1 to 20. For A, B sends multipart `file`, string-list hints, `{heard,correct,count}` correction history, and source pages with edge requests.

| Method | Route | Input / result |
| --- | --- | --- |
| GET | `/api/tree` | `{subjects:[...]}` with nested exams/modules/resources |
| POST | `/api/subjects` | `{name}` → created row |
| POST | `/api/exams` | `{name, subjectId, date?}` → created row |
| POST | `/api/modules` | `{name, examId}` → created row |
| POST | `/api/resources` | `{moduleId,type:"web"|"youtube",url,title?,text?}` → resource, initially pending |
| POST | `/api/resources/upload` | multipart `file`, `moduleId`, `tag` → resource |
| GET | `/api/resources/:id/status` | Extraction JobStatus and plain failure explanation |
| GET | `/api/resources/:id/file` | Original PDF/PPTX bytes; optional single byte Range |
| POST | `/api/modules/:id/build` | → 202 `{jobId}` |
| GET | `/api/jobs/:id` | Persisted `queued/running/done/failed`, readable error on failure |
| GET | `/api/graph?subjectId=` | `{nodes,edges}`; embeddings omitted |
| POST | `/api/questions/next` | `{moduleId,n,kind?,conceptId?,difficulty?}` → verified questions |
| POST | `/api/attempts` | `{questionId,conceptId,correct}` → `{readiness,trace,xp}` |
| POST | `/api/ask` | `{moduleId,question}` or `{moduleId,kind:"summary"|"formula_sheet"}` → cited answer/refusal |
| GET | `/api/revision-plan?examId=&minutesPerDay=` | Ordered weighted plan within budget |
| GET | `/api/revision-path?conceptId=` | Root review, 2 basic questions, intermediate review, retry |
| POST | `/api/lectures` | multipart `audio`, `moduleId`, `slidesResourceId` → 202 `{lectureId,jobId}` |
| GET | `/api/lectures/:id` | Transcript, flags, glossary, status; audio is available at the route below |
| GET | `/api/lectures/:id/audio` | Original audio; supports single byte Range |
| POST | `/api/lectures/:id/corrections` | `{flagId}` or `{startIdx,endIdx,to}` → `{words,flags}` |
| POST | `/api/dev/seed` | Idempotent; available only with `ENABLE_DEV_SEED=true`, forbidden in production config |

Errors use `{error:{code,message}}`: 400 `bad_request`, 422 `scanned_pdf`, 404 `not_found`, 429 `rate_limited`, 503 `ai_unavailable`, 500 `internal`. Invalid file ranges return 416 with `bad_request`. Extraction is asynchronous: failures are recorded as `unsupported` with a plain explanation, keeping the resource in the tree.

Resource tags are `lecture`, `notes`, `past_paper`, `model_paper`. Upload limit is **20 MB (20,000,000 bytes)**, including audio. Document uploads allow only matching PDF/PPTX extensions and signatures: PDF headers or bounded ZIP inspection of PPTX presentation metadata. Control and Unicode format/zero-width characters are removed from captured text; line controls become spaces. Stored pages are capped at **20,000 UTF-16 code units** after sanitization (without splitting surrogate pairs); web text is sanitized before 2,000-character pseudo-page splitting. AI responses are sanitized before persistent caching. Original source bytes are retained unchanged in GridFS. Web extraction supports static HTML/plain text, not arbitrary JavaScript-rendered sites; redirects/private networks are rejected. YouTube extraction is delegated to Module A. All timestamps are source-provided and should be presented as approximate.
