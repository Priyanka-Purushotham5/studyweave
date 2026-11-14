# Fixtures

One demo module ("Backpropagation") in contract shape. Everything is consistent: every quote is on the cited page.

| File | Schema | Used by |
|---|---|---|
| tree.json | Tree | B seed, C mocks (`GET /api/tree`) |
| graph.json | Graph | B seed, C mocks (`GET /api/graph`); also what B's build pipeline must produce from `ai_raw/` via A |
| questions.json | QuestionsNextResponse | B seed, C mocks |
| trace.json, attempt_response.json | Trace, AttemptResponse | C mocks; wrong answer on backpropagation traces to Chain rule (likely) |
| revision_plan.json | RevisionPlan | C mocks |
| lecture.json, glossary.json | Lecture, GlossaryResponse | caption fix view; flags are produced by A's real flagging code |
| pages.json | (page text) | A's FakeGemini and quote checks |
| error_ai_unavailable.json | Error | C error banner tests |
| files/sample.pdf, sample.pptx, scanned.pdf | | upload tests (scanned.pdf must give 422 `scanned_pdf`) |
| ai_raw/*.json | (not a contract) | what A's FakeGemini returns as "model output"; A verifies and reshapes it |
