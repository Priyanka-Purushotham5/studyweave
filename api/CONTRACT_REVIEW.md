# Danush's B-to-C contract review

**Status update:** the original review below is historical. The completion follow-up at the end records the implemented resolutions; shared files remain unchanged.

Reviewed `origin/main` at `0cd9ff8` (`contracts/schemas.json`, `contracts/types.ts`, `contracts/README.md`, mapped fixtures, and the A endpoints). Shared contracts, fixtures and teammate source are unchanged. This report is a proposed follow-up discussion, not an approved contract change or a message sent to teammates.

## Accepted; B adapted to these shapes

- `GET /api/tree` returns `{subjects: [...]}`, not a bare array.
- Trace paths run **missed concept → root**. `Trace.evidence` is one Evidence object. B reverses that path internally when constructing root-first revision steps.
- Resource pages on B-to-C responses are Page objects without resourceId; A extract/edge/answer requests use ResourcePage objects with it.
- Resource, hierarchy, JobStatus and Lecture responses do not expose Mongo IDs, hashes, embeddings, parent foreign keys, file IDs or other internal metadata.
- QuestionsNext limits n to 20; question options are always present. The public error enum includes scanned_pdf/422.
- Corrections sent to A use `{heard, correct, count}`, transcription uses multipart `file`, hints are string lists, glossary/paper tagging use plain Page objects, and edge typing includes source pages.
- B seeds the agreed tree/graph/questions and its default FakeAiClient reads shared fixture files. Historical isolated unit-test data remains separate from the public seeded demo.

AJV 2020-12 now validates existing shared request/response definitions at runtime. The local B schemas remain only for endpoints with no shared definition yet and as legacy test inputs; shared definitions win.

## Changes I recommend before C integrates every endpoint

1. **Complete the missing B endpoint contracts.** Add schemas/types plus sample fixtures for subject/exam/module creation (including parent IDs), resource creation/upload metadata, build start `{jobId}`, lecture start `{lectureId,jobId}`, B ask input `{moduleId, question}` or `{moduleId,kind}`, revision-plan query, and revision-path steps. The existing `AnswerRequest` is A's input and cannot be used unchanged for B's ask route. Resource upload HTTP status and lecture/build 202 behavior should be documented alongside the shapes.
2. **Agree on concept identity across modules.** `c_ + snake_case(name)` collides when two modules both contain "Chain rule". Either namespace IDs by module or make concept membership explicitly multi-module. B currently detects a conflicting ID and fails the job instead of overwriting another module's concept. The same convention is used for edge IDs; clarify whether different edge types may share endpoints.
3. **Expose extraction diagnostics.** `Resource.additionalProperties=false` currently has no extractionError or extractionJobId. C can display unsupported but cannot obtain the plain extraction-failure explanation through that response. Suggest an optional extractionJobId with the existing JobStatus error path, or an optional extractionError field. Keep the later asynchronous pending/unsupported behavior; the older synchronous scanned-PDF upload expectation conflicts with it.
4. **Specify RevisionPath.** I propose a discriminated array: review `{kind:'review',conceptId,evidence:Evidence[]}`, practice `{kind:'practice',conceptId,difficulty:1,n:2}`, retry `{kind:'retry',conceptId}`. Root/intermediate reviews use evidence arrays, independently of Trace's single evidence object. Healthy prerequisites produce only retry.
5. **Tighten Question schema semantics.** The prose requires exactly four options for mcq/past_paper and zero for conceptual/numerical; the current schema only enforces maxItems:4. Add conditional length/answer-letter validation and minItems:1 for conceptIds. Also consider readiness bounds 0–100 on Trace/AttemptResponse, matching Concept.

## Fixture/integration decisions requiring team agreement

- **Readiness and likely-gap history:** graph.json contains readiness values (82/35/52), trace.json says likely, and attempt_response.json includes a post-attempt 41. No attempts fixture explains those numbers or establishes the two-attempt threshold. Please supply deterministic attempt histories (and IDs/timestamps/order) that reproduce the expected demo. B seeds the graph numbers faithfully but does not fabricate attempt rows; a root without persisted attempts is correctly possible.
- **Intra-module edges:** B4 says to skip same-module neighbor pairs, but every edge in graph.json is within m_backprop. Please confirm a separate within-module candidate phase or amend that rule. Current builds preserve existing seeded edges and compute cross-module candidates; the passing seeded build test does not prove fresh-build equality to graph.json.
- **Input-aware AI fake:** A's FakeGemini returns fixed raw answer/edge/question fixtures. With the seeded pages, an unrelated question can still receive the canned chain-rule answer because its citation verifies. Edge fixture responses are keyed by pair positions, not concept IDs. Please make the fake input-aware (or provide documented scenario overrides) before relying on the no-key demo for semantic refusal or arbitrary candidate ordering. B does not rewrite teammate code.
- The current demo has only one difficulty-1 Chain rule question, while revision-path asks for two. Supply another basic root question, or explicitly allow generation/repetition/shortfalls. B never invents unverified questions to fill a quota.

## Verified locally

- All 9 mapped fixtures validate, with all quoted evidence verified.
- A offline tests with the API key unset: 140 passed, 2 live tests skipped.
- B regressions plus new shared-contract and actual HTTP A/B tests are recorded in the implementation handoff.
- Actual A/B tests cover a real fixture PDF parse, seeded concept build, strict graph output, two accepted lecture corrections teaching the third lecture, and refusal when the fake citation is absent from the module pages.

No message has been sent and no shared-schema changes have been made. The recommendations above can be copied into the team discussion or used for a coordinated contract PR.


## Code-completion follow-up

The original runtime gaps above are now resolved within Module B:

- **Fresh builds:** B4 neighbor search still excludes same-module pairs. A separate source-aware curriculum candidate phase supplies within-module pairs for A to type. Fresh builds with no concept/edge rows reconstruct the fixture concept definitions/evidence and edge topology through the actual fake-mode A service. Fresh readiness stays null and exam weights reflect actual papers; the demo fixture's pre-existing mastery/weights are not invented for an unattempted build.
- **Readiness/trace:** the explicit demo seed adds labelled synthetic histories, mathematically reproducing 82/35/52 and the complete agreed wrong-answer response (41, Chain rule likely gap). Shared fixtures are untouched; these records are never presented as real learner measurements.
- **Basic practice:** generation requests enough candidates when filtering difficulty and deduplicates by concept/kind/text. Both FakeAiClient and actual A yield two distinct verified basic Chain rule questions from the existing shared raw fixtures.
- **Identity:** existing IDs and fixtures are unchanged; a collision in another module can receive a deterministic suffix only when CONCEPT_ID_COLLISIONS=suffix is explicitly enabled. The default reject policy preserves the current team convention. Atomic conditional writes prevent another module from being overwritten, including concurrent creation. This fits the existing string-ID JSON schemas; the team should record the extended naming convention in a future reviewed documentation PR.
- **Missing B endpoint definitions:** GET /api/openapi.json bundles shared definitions and complete local B endpoint schemas without editing the protected shared package. These can be promoted to shared contracts by coordinated PR; this is no longer a missing backend implementation.
- **Extraction diagnostics:** POST resource responses provide a Location header; GET /api/resources/:id/status returns the existing shared JobStatus shape, including readable errors. No additional Resource properties were introduced.
- **Question semantics:** B enforces option counts, answer letters, non-empty concepts and verified citations on persisted reads and generated writes, beyond the shared schema's current prose constraints.
- **Durability:** concurrent attempts cannot overwrite newer readiness. Corrections are journalled atomically with the transcript, use revision checks, and rebuild their learned-count projection; old counter data migrates without losing counts.

The default A fake still returns fixed model outputs, so semantic refusal on arbitrary questions is not a model-quality result. Real Gemini quality, production Atlas/vector behavior, public-domain HTTPS and the teammate-owned web/extension acceptance tests remain separate service/team validation steps, not claims made by the local fake acceptance suite.
