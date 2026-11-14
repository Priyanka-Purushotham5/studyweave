# StudyWeave 3.0 Module B

Node 20.19+ / TypeScript / Express / MongoDB. No Module A or C source existed in the workspace. All implementation is in `api/`, `deploy/`, and Module B CI. No Gemini SDK, endpoint, or key is used.

## Run locally

Install Node 20.19+ and MongoDB 7, or use Atlas. From the repository root:

```sh
cd api
npm ci
cp .env.example .env
# Edit MONGODB_URI if MongoDB is not at localhost:27017.
set -a
. ./.env
set +a
npm run build
npm run seed
npm run dev
```

The API listens on port 3000. `AI_MODE=fake` requires no AI service or API key. For Module A, set `AI_MODE=http` and `AI_SERVICE_URL=http://localhost:8000`, then restart. Fake parsing deliberately returns the three demo pages; it does not parse real documents. Real PDF/PPTX/YouTube extraction and audio transcription require Module A.

```sh
curl http://localhost:3000/healthz
curl http://localhost:3000/api/tree
curl 'http://localhost:3000/api/graph?subjectId=s_ml'
curl http://localhost:3000/api/questions/next \
  -H 'Content-Type: application/json' \
  -d '{"moduleId":"m_backprop","conceptId":"c_chain_rule","difficulty":1,"n":1}'
```

MongoDB persists hierarchy, pages, concepts, embeddings, edges, questions, attempts, readiness, lectures, corrections, job states, and TTL AI cache. GridFS retains original document/audio bytes. MongoDB indexes are created at startup. `/healthz` is liveness; `/readyz` pings MongoDB.

## Verify

```sh
cd api
npm ci
npm run build
npm test
npm run format:check
npm run eval:trace
npm audit
```

Vitest starts an ephemeral MongoDB 7.0.14 using mongodb-memory-server; the first run downloads its binary. Tests also open loopback HTTP servers, so network/process sandbox permission may be required. No Atlas, Gemini, or production credentials are used. The trace evaluation uses 20 labelled synthetic cases; its hit rate is not a real-world user measurement.

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for B-number coverage, acceptance evidence, decisions, limitations, and the complete changed-file inventory. See [deploy/README.md](../deploy/README.md) for container and HTTPS deployment steps.

## API contract proposals

No `contracts/` or shared `fixtures/` existed. Proposed schemas/types are staged in `src/contracts/`; deterministic fixtures are in `src/fixtures/demo.ts`. Existing shared contracts were not modified. Priyanka and Rohit must review these proposals before promoting them to the shared folders. Runtime AJV validation covers JSON request bodies and JSON responses. Multipart and query inputs are validated at their boundaries. `tests/contracts.test.ts` validates the demo graph/questions and their citations.

| Method | Route | Input / result |
| --- | --- | --- |
| GET | `/api/tree` | Nested subjects → exams → modules → resources |
| POST | `/api/subjects` | `{name}` → created row |
| POST | `/api/exams` | `{name, subjectId, date?}` → created row |
| POST | `/api/modules` | `{name, examId}` → created row |
| POST | `/api/resources` | `{moduleId,type:"web"|"youtube",url,title?,text?}` → resource, initially pending |
| POST | `/api/resources/upload` | multipart `file`, `moduleId`, `tag` → resource |
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
| GET | `/api/lectures/:id` | Transcript, flags, glossary, status, original audio URL |
| GET | `/api/lectures/:id/audio` | Original audio; supports single byte Range |
| POST | `/api/lectures/:id/corrections` | `{flagId}` or `{startIdx,endIdx,to}` → `{words,flags}` |
| POST | `/api/dev/seed` | Idempotent; available only with `ENABLE_DEV_SEED=true`, forbidden in production config |

Errors use `{error:{code,message}}`: 400 `bad_request`, 404 `not_found`, 429 `rate_limited`, 503 `ai_unavailable`, 500 `internal`. Invalid file ranges return 416 with `bad_request`. Extraction is asynchronous: failures are recorded as `unsupported` with a plain explanation, keeping the resource in the tree.

Resource tags are `lecture`, `notes`, `past_paper`, `model_paper`. Upload limit is 25 MiB. Web extraction supports static HTML/plain text, not arbitrary JavaScript-rendered sites; redirects/private networks are rejected. YouTube extraction is delegated to Module A. All timestamps are source-provided and should be presented as approximate.
