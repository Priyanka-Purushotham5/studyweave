# Public demo access policy

Public mode exposes only the shared demo fixtures. Attempts are evaluated in memory and discarded: no anonymous attempt, readiness, concept, question, or counter writes occur. Question selection never invokes AI. Readiness and traces reflect fixture values, not a visitor's accumulated history. This is not a personalized study experience.

| Route | Method | Classification / public mode |
| --- | --- | --- |
| `/healthz`, `/readyz` | GET | Public health/readiness (readiness checks Atlas connectivity) |
| `/api/tree`, `/api/graph` | GET | Public fixture-only demo reads |
| `/api/questions/next`, `/api/attempts` | POST | Public fixture-only demo interactions, validated and globally rate limited |
| `/api/subjects`, `/api/exams`, `/api/modules` | POST | Content administration: denied |
| `/api/resources` | POST | Content ingestion: denied |
| `/api/resources/upload` | POST | Upload: denied |
| `/api/resources/:id/status`, `/api/resources/:id/file` | GET | Resource status/file: denied |
| `/api/modules/:id/build` | POST | AI build: denied |
| `/api/jobs/:id` | GET | Internal job status: denied |
| `/api/ask` | POST | AI generation: denied |
| `/api/revision-plan`, `/api/revision-path` | GET | User/study data: denied |
| `/api/lectures` | POST | Audio upload/AI: denied |
| `/api/lectures/:id`, `/api/lectures/:id/audio` | GET | Lecture content/audio: denied |
| `/api/lectures/:id/corrections` | POST | Content modification: denied |
| `/api/dev/seed` | POST | Development seeding: denied |
| `/api/openapi.json` | GET | API discovery: denied |
| Module A `/v1/*` | any | Internal service only, no public port |
| Any other route or method, including admin, debug, reset, HEAD and OPTIONS | any | Default deny (404); no such admin/reset routes were found |

Both public hostnames must enforce the identical allowlist. Application mode `PUBLIC_DEMO=true` provides a second enforcement layer and fixture isolation. The interaction limit is an in-process global limit of 60 POST requests per minute, not a per-user quota. It limits writes and AI calls by eliminating them, but does not provide distributed DDoS protection. Large floods or restarting/scaling the process can defeat its availability protection. Public GETs are not currently rate limited. No user authentication or private management API is provided in this mode. Existing UI controls for ingestion, uploads, building, Q&A, revision, and lectures will fail with 404 and should not be advertised as public demo features.

`host-caddy-public-demo.example` shows the replacement API site and new root site. Preserve any other existing host Caddy configuration; back up the original first and validate the full candidate before reloading. Deploy the backend with `PUBLIC_DEMO=true` before exposing the root and replace the API proxy policy at the same controlled rollout. Keep both API and UI ports bound to loopback, and AI internal. Never print or replace the environment file. Roll back by restoring the saved Caddyfile and previous API image/configuration, validating and reloading Caddy; retain all volumes and Atlas data. The previous configuration exposes more API routes, so rollback restores that exposure.
