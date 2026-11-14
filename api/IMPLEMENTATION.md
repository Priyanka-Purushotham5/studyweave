# Module B implementation handoff

## Scope and ownership

The workspace initially contained only `.refact` editor metadata, with no source code, shared schemas, fixtures, or Git repository. A repository was initialized on `b/module-b-implementation`. No teammate folder was created or modified. Contracts/fixtures remain Module B-local proposals awaiting cross-module review. No secrets, credentials, purchases, provisioning, DNS changes, or public deployments were made.

The supplied 21-page plan was read completely. Its task descriptions were treated as specifications for the user's explicitly authorized Module B work; responsibilities owned by Priyanka/Rohit were not executed.

## Implementation by task

| Task | Implemented behavior | Verification / external boundary |
| --- | --- | --- |
| B1 | Express, typed config, contract errors, AJV request/response checks, health/readiness endpoints | Compile, API errors, malformed JSON, unknown routes, contract tests |
| B2 | Subject/exam/module creation, foreign-parent checks, nested resource tree | Mongo-backed create/tree integration, empty tree unit test |
| B3 | Pending asynchronous web/YouTube/PDF/PPTX capture, SHA-256 dedupe, pseudo-pages, extraction failures, original files in GridFS, retries | Pending-before-completion, 3-page fake parse, scanned failure retained, stable IDs, source downloads/ranges, retry without duplicate files; real parsers belong to A |
| B4 | NeighborFinder, cosine and Atlas search adapters, cross-module top-k pairs with undirected dedupe | Cosine ranking/dedupe/top-k and real Mongo fallback tests; actual Atlas ranking requires credentials |
| B5 | Extract/embed/candidate/type/store pipeline, deterministic concept IDs, job states and restart handling, cached rebuilds | Exact seeded graph rebuild, repeat-build idempotence/cache, cross-module two-sided edges/null drops, AI-failure jobs |
| B6 | Recency-weighted readiness, persisted attempts/readiness, deterministic equal-time attempt ordering, XP | 67 example, null/0/100/older-weight cases, wrong-attempt integration |
| B7 | Cycle-safe breadth-first ancestor trace, weakest-first, nearest ties, root evidence, likely/possible | Chain, cycle, diamond, healthy/self, minimum-attempt status tests; synthetic 20-case harness |
| B8 | Verified/citation-checked adaptive question selection, readiness then last-wrong order, concept/kind/difficulty/n filters; generated shortfalls | Filtering/ordering tests, traced root basic-question integration, stored bad citation rejection, A-down stored-content drill |
| B9 | Cached grounded ask, summary/formula-sheet pass-through, refusal preservation, citation refusal guard | Refusal/cache and no-citation failure integration |
| B10 | Audio persistence, slides glossary, vocabulary/hints through A, flags/auto-fixes, timestamp-preserving corrections and shifted indexes, persisted learned counts | Two correction accepts teach the next lecture; manual span logic, malformed spans, HTTP multipart vocabulary/hints seam |
| B11 | Mongo TTL cache with canonical request hashes, upload hashes, in-flight sharing and bounded exponential retry | Repeated build/ask and cross-client persistent cache tests, four-attempt 429→503 drill |
| B12 | Idempotent CLI/optional HTTP fixture seed | Repeated seed, exact public graph equality; production HTTP seed disabled |
| B13 | Distinct-paper weights, automatic weight job after tagged upload, priority and budgeted revision plan | Second-paper upload raises graph weight; duplicate question mentions count once/paper; priority 180 and budget tests |
| B14 | Multi-stage/non-root Node 20 image, Compose, Caddy HTTPS/basic auth, CI, smoke script | Compose and shell syntax validated; local seeded HTTP smoke passes. Docker daemon stopped; actual image, Vultr, DNS, TLS remain unverified |
| B15 | 768-dimensional Atlas vector-index definition and operator creation script; default cosine fallback | Fallback integration passes; index creation/tier readiness and actual Atlas query not run |
| B16 | Root review/evidence, two level-1 questions, intermediate reviews with evidence, original retry; healthy case retry only | Exact step order, intermediate evidence, healthy-path unit tests |

## Test evidence

Final local verification on Node 20.20.2:

- `npm test`: **62 passed**, 5 files, no failures/skips (20.69 seconds).
- `npm run build`: passed.
- `npm run format:check`: passed after formatting the flagged file.
- `npm audit`: zero known vulnerabilities.
- Trace evaluation: 20/20 labelled synthetic cases.
- Production and test Compose configuration validation: passed.
- `bash -n deploy/scripts/smoke.sh` and `git diff --check`: passed.
- Smoke script against seeded local HTTP API: passed inside the integration suite; public TLS was not tested.

Test files:

- `tests/core.test.ts`: deterministic readiness, tree, trace, filtering, revisions, corrections, hashes, citations, vectors, config.
- `tests/api.test.ts`: Supertest + real ephemeral MongoDB persistence and acceptance tests, jobs, cache, resources, lectures, weights, GridFS/ranges, HTTP smoke.
- `tests/contracts.test.ts`: proposed fixture/schema/citation validation and rejection cases (I1 locally).
- `tests/http-ai.test.ts`: actual HTTP JSON/multipart adapter behavior and upstream failure mapping.
- `tests/resources.test.ts`: web pseudo-pages and public-URL safety checks.

The trace harness returned 20/20 on labelled synthetic fixture cases. These cases are deterministic code checks, not a measured live student root-cause hit rate. No live Gemini, WER, real edge precision, or real-world accuracy claim is made.

## Specification decisions

1. Later B3 amendment takes precedence: saves return `pending`, and failed resources remain `unsupported` in the tree. The earlier synchronous 422/no-row scanned-PDF acceptance statement cannot simultaneously hold. Module A's direct parser still maps its 422 to a readable extraction failure in B.
2. Retained the recommended three edge types: `prerequisite`, `extends`, `contrasts`. No decision approving five types was available.
3. Candidate generation excludes same-module pairs as explicitly required by B4. The demo graph contains seeded same-module edges; builds preserve those existing edges. The separate cross-module pipeline test proves newly typed edges are stored with two-sided evidence.
4. A correction must be observed twice before it becomes an automatic hint. Thus two accepted occurrences teach the following lecture; a single first acceptance does not auto-fix the very next lecture.
5. No agreed schemas were present to preserve. Types and schemas are staged under `api/src/contracts`, not promoted into protected shared folders. Real A may require coordinated field-shape alignment; HTTP transcription currently uses the specified `audio` multipart field, while parsing uses `file`.
6. C13/live battle, extension/browser integration, accessibility, A parsing/model evaluation, event submission, and teammate communications remain with their owners.

## Remaining blockers and limits

- Real Module A and C are absent. I2/I3 are covered locally against FakeAiClient and the HTTP adapter seam, but not against Priyanka's implementation. I4/I5/I6/I8 require teammate code and/or live credentials.
- Atlas URI/access and tier/index readiness were unavailable. Mongo behavior is tested locally; actual Atlas vector results are not claimed.
- No approved Vultr host/domain was supplied. Public I7 and real HTTPS smoke remain operator-run steps.
- Docker is installed but its daemon is stopped. Container image/runtime and Caddy configuration execution are untested. Both Compose files parse successfully.
- GitHub is not connected and there is no remote. Commits exist locally; no PR, shared-contract approval, branch protection, or remote CI result is claimed.
- Jobs are single-process work with durable state, not a distributed queue. A crash marks interrupted jobs failed; re-upload/rebuild retries work. No multi-worker deployment or multi-document transactional guarantees are claimed.
- Web capture intentionally supports static HTML/plain text only. Private addresses, redirects, oversized responses, and non-text pages are rejected. FakeAiClient returns fixtures instead of parsing real files.
- Caddy provides a single-user HTTPS authentication boundary. Multi-tenant accounts/authorization were not part of the supplied API contract.

## Changed-file inventory

- `.github/workflows/ci.yml`
- `.gitignore`
- `api/.env.example`
- `api/IMPLEMENTATION.md`
- `api/README.md`
- `api/package-lock.json`
- `api/package.json`
- `api/src/ai/aiClient.ts`
- `api/src/app.ts`
- `api/src/config.ts`
- `api/src/contracts/schemas.ts`
- `api/src/contracts/types.ts`
- `api/src/contracts/validation.ts`
- `api/src/db/store.ts`
- `api/src/evalTrace.ts`
- `api/src/fixtures/demo.ts`
- `api/src/routes/index.ts`
- `api/src/seed.ts`
- `api/src/server.ts`
- `api/src/services/citations.ts`
- `api/src/services/errors.ts`
- `api/src/services/files.ts`
- `api/src/services/jobs.ts`
- `api/src/services/learning.ts`
- `api/src/services/lectures.ts`
- `api/src/services/neighbors.ts`
- `api/src/services/pipeline.ts`
- `api/src/services/resources.ts`
- `api/src/services/seed.ts`
- `api/src/services/study.ts`
- `api/tests/api.test.ts`
- `api/tests/contracts.test.ts`
- `api/tests/core.test.ts`
- `api/tests/http-ai.test.ts`
- `api/tests/resources.test.ts`
- `api/tsconfig.json`
- `deploy/.env.example`
- `deploy/Caddyfile`
- `deploy/Dockerfile`
- `deploy/README.md`
- `deploy/atlas-vector-index.json`
- `deploy/docker-compose.test.yml`
- `deploy/docker-compose.yml`
- `deploy/scripts/create-vector-index.mjs`
- `deploy/scripts/smoke.sh`

See [README.md](README.md) for exact local commands and [deployment instructions](../deploy/README.md) for Atlas, container, seed, and HTTPS commands.

## Demo hardening follow-up

Contracts and fixtures were left unchanged. Production Compose now includes an image-supplied Module A on the private backend bridge, with no host port. Only A receives GEMINI_API_KEY; B uses http://ai-service:8000. Outbound traffic remains enabled for Gemini/Atlas. Module A's image/source and the Docker daemon are unavailable, so actual container startup remains untested.

Document upload validation now enforces a 20,000,000-byte limit and PDF/PPTX extension/signature agreement. PPTX validation lazily reads ZIP metadata, checks presentation members/content type, and rejects oversized/encrypted archives. Audio shares the size limit. Captured text and cached AI responses strip control/format characters; stored pages cap at 20,000 UTF-16 units. Original GridFS bytes remain unchanged. Tests cover exact size boundaries, forged files, real ZIP containers, controls/zero-width characters, and sanitization in persisted web/document/YouTube data and AI cache.

The root scripts/smoke.sh forwards to the deployment implementation; it verifies health, tree, stored verified-question reuse, and standard curl HTTPS certificate checks. The HTTP test bypass explicitly reports TLS untested. Credential-dependent README steps are marked.

Additional files: api/src/services/uploads.ts, api/src/services/text.ts, api/tests/uploads.test.ts, api/tests/text.test.ts, scripts/smoke.sh. The follow-up suite passed all 82 tests across 7 files (25.04 seconds), superseding the earlier 62-test baseline. Build, formatting, dependency audit (zero known vulnerabilities), Compose checks, shell syntax, and the 20-case synthetic trace evaluation passed. Public TLS, real Module A/Gemini, Atlas, and Docker runtime remain untested.

## Integration with merged team main

Merged origin/main at 0cd9ff8 onto b/module-b-integration, preserving all earlier B commits and both modules' CI. No differences exist versus origin/main under contracts/, fixtures/ or ai-service/. B now uses shared AJV 2020-12 definitions, shared seed data, a shared-fixture default FakeAiClient, strict public response projections, missed-to-root trace paths and single-object trace evidence. A's multipart/file, correction-history, page and edge-request formats are integrated. Startup resource recovery now targets only resources owned by interrupted extraction jobs, preserving the fixture's pending video.

Verification: 90 B tests across 9 files passed, including three real HTTP integration tests against merged A in fake mode; 140 A offline tests passed with 2 live tests skipped after explicitly unsetting GEMINI_API_KEY; all 9 mapped shared fixtures and their citations passed validation. Build, formatting, dependency audit (zero advisories), Compose syntax, and local HTTP smoke passed. Docker image execution, public TLS, Atlas and real Gemini remain untested. The real A fake uses fixed model-output fixtures, so semantic refusal on arbitrary seeded questions is not claimed.

The running local demo is B at 127.0.0.1:3000, A at 127.0.0.1:8001 (FAKE_GEMINI=1, key unset), and MongoDB at 127.0.0.1:27018, database studyweave_demo. These are local processes with temporary local DB data, not a deployed managed service.

See CONTRACT_REVIEW.md for requested B-to-C additions and unresolved ID, attempt-history, within-module candidate and fake-service decisions. In particular, passing a seeded build does not prove fresh-build equality to graph.json. No shared-contract edits or teammate messages were made, and no branch has been pushed.
