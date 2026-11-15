# StudyNova specification audit

Compared against all 21 pages of the November 13, 2026 *StudyWeave 3.0: Module Split, Implementation Plan and Test Plan*. The PDF uses StudyWeave as its historical name. This table identifies implementation and evidence, not a claim that fake results prove real AI quality. `Implemented` below means code and automated coverage exist; caveats are stated individually.

## Module A — AI service

| Task | Status | Evidence / remaining work |
| --- | --- | --- |
| A1 | Implemented | FastAPI health, error mapping and fake client; `test_main.py`, `test_gemini.py`. |
| A2 | Implemented | Citation normalization and verification; `test_citations.py`. |
| A3 | Implemented | PDF/PPTX extraction, notes and scanned-file error; `test_parse.py`. |
| A4 | Implemented | Concept extraction and evidence filtering; `test_concepts.py`. |
| A5 | Implemented | 768-dimensional embedding and batching; `test_embed.py`; live model not verified. |
| A6 | Implemented | Edge validation and two-sided evidence; `test_edges.py`. |
| A7 | Implemented | Grounded questions, difficulty, filtering; `test_questions.py`. |
| A8 | Implemented | Grounded answer/refusal; `test_answer.py`. |
| A9 | Implemented | Glossary filtering and deduplication; `test_glossary.py`. |
| A10 | Partial / external | Fake transcription and large-file path tested; real five-minute clip requires approved Gemini credentials and model. |
| A11 | Implemented with caveat | Flagging, corrections and fake hints tested in `test_flagging.py`; tuning on a real clip remains unverified. |
| A12 | Partial / external | WER scripts and fake tests exist; real with/without-hints measurement requires reference clip and approved live AI. |
| A13 | Implemented | Numerical double-solve and mismatch rejection; `test_numerics.py`; live agreement measurement remains outstanding. |
| A14 | Implemented | Paper-to-concept tagging; `test_papers_video_suggest.py`. |
| A15 | Implemented with caveat | Video interface and timestamp policy tested with fake output; real YouTube transcript unverified. |
| A16 | Partial / external | Evaluation scripts and tests exist; 100 real generated items and 30 human-rated edges still needed. |
| A17 | Implemented | Optional module suggestion endpoint and tests; UI uses local title matching rather than calling A. |

## Module B — API, data and deploy

| Task | Status | Evidence / remaining work |
| --- | --- | --- |
| B1 | Implemented | Configuration, validation, errors and health; `api.test.ts`, `contracts.test.ts`. |
| B2 | Implemented | Hierarchy and nested tree; `api.test.ts`. |
| B3 | Implemented with caveat | Uploads, deferred extraction, deduplication, URL safety; `api.test.ts`, `uploads.test.ts`, `resources.test.ts`. Real YouTube output unverified. |
| B4 | Implemented | Atlas and cosine implementations, ranking/fallback tests; `core.test.ts`, `vector-index.test.ts`. |
| B5 | Implemented | Pipeline, jobs, evidence and idempotency; API and fake-A HTTP integration tests. |
| B6 | Implemented | Weighted readiness and persistence; `core.test.ts`, `api.test.ts`. |
| B7 | Implemented | Cycle-safe prerequisite trace, likely/possible and tie tests; `core.test.ts`, `api.test.ts`. |
| B8 | Implemented | Adaptive, verified question selection and filters; API tests. |
| B9 | Implemented | Grounded answer and refusal with cache; API tests. |
| B10 | Implemented with caveat | Lectures, correction persistence and fake-A correction loop; live speech transcription unverified. |
| B11 | Implemented | Persistent cache and backoff; `api.test.ts`, `http-ai.test.ts`. |
| B12 | Implemented | Idempotent fixture seed for local/test; production seed endpoint disabled by design. |
| B13 | Implemented | Paper weights, priorities and revision plan; core/API tests. |
| B14 | Partial / external | Docker, Caddy and CI exist; current production service and smoke require authorized live verification. |
| B15 | Partial / external | Atlas index definition and checking exist; current external index status not verified in this branch. |
| B16 | Implemented | Ordered root-first revision path; core and API tests. |

## Module C — web app and extension

| Task | Status | Evidence / remaining work |
| --- | --- | --- |
| C1 | Implemented | Typed API client, fixture-backed MSW browser worker and error UI; mock-mode browser tests exercise the HTTP boundary. |
| C2 | Implemented | React Flow material map, expand/collapse and resource-opening browser tests. |
| C3 | Implemented | Keyboard outline and browser navigation test. |
| C4 | Implemented | States, icons, labels, edge details and citations; unit/browser tests. |
| C5 | Implemented | Upload, URL capture and status UI; browser and backend tests. |
| C6 | Implemented with caveat | Single-login browser extension and remembered selection; actual live toolbar save was verified previously; store publication and signed-out UI check remain outstanding. |
| C7 | Implemented | Quiz, answer feedback and citations; browser tests. |
| C8 | Implemented | Adaptive battle engine and mock end-to-end battle tests. |
| C9 | Implemented | Trace highlights and status copy; browser test. |
| C10 | Implemented | Captions and corrections with fixture tests; live speech unverified. |
| C11 | Partial | Read-aloud, preferences, jest-axe checks on readiness/quiz/battle components and automated browser axe checks exist; remaining components need individual jest-axe checks and a human screen-reader audit is not signed off. |
| C12 | Implemented | Revision plan and empty state; browser test. |
| C13 | Missing / product decision | QR-based multi-user live battle and cheat sheet need a collaboration/session design and shared API contracts; user chose to keep this blocked pending team agreement. |
| C14 | Partial | Local title-based suggestion and manual selection exist; no A-backed suggestion call. |

## Integration and operational checks

| Check | Status | Evidence / remaining work |
| --- | --- | --- |
| I1 | Implemented | Fixture/schema and quote validation in CI; module sample contracts also covered by tests. |
| I2–I3 | Implemented locally | Fake-A HTTP integration tests for PDF build and lecture corrections. |
| I4 | Implemented locally | Real-B seeded browser test covers tree, graph, wrong answer, Chain Rule trace and first revision-plan item in a disposable MongoDB stack with fake A. |
| I5 | Partial | Prior real Chrome toolbar production capture succeeded with installed extension and isolated module; repeatable CI persistent-Chromium test is not yet present. |
| I6 | Partial | Keyboard and serious/critical axe checks on five screens; manual NVDA/VoiceOver sign-off and full component-level jest-axe checks remain. |
| I7 | Partial / external | Smoke script exists; current production authenticated HTTPS smoke is not run without user authorization/credentials. |
| I8 | Blocked | Requires explicit approval of real Gemini key, model, quota and cost, plus real slides/audio and a live end-to-end test. |

Pitch metrics (real WER, 100-item citation rate, two-person 30-edge rating, 20-case root hit rate, numerical agreement, Lighthouse), Devpost/DEV submissions, credits, backup video, human accessibility sign-off and rehearsals are not established by automated local tests. The specification's contract freeze remains authoritative; `contracts/` and `fixtures/` are unchanged.

Branding deliberately leaves storage keys (`studyweave-*`), MongoDB database names, shared schema identifiers, package names, image names and internal paths unchanged for compatibility. The project directory and historical source PDF also retain their names.
