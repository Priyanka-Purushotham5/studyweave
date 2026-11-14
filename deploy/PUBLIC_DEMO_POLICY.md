# Public demo access policy

Public mode exposes only the shared demo fixtures. Attempts are evaluated in memory and discarded: no anonymous attempt, readiness, concept, question, or counter writes occur. Question selection never invokes AI. Readiness and traces reflect fixture values, not a visitor's accumulated history. This is not a personalized study experience.

| Route | Method | Classification / public mode |
| --- | --- | --- |
| `/healthz` | GET | Public health |
| `/readyz` | GET | Internal readiness; blocked at public proxies |
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

Both public hostnames must enforce the identical allowlist. Application mode `PUBLIC_DEMO=true` provides a second enforcement layer and fixture isolation. The interaction limit is an in-process global limit of 60 POST requests per minute, not a per-user quota. It limits writes and AI calls by eliminating them, but does not provide distributed DDoS protection. Large floods or restarting/scaling the process can defeat its availability protection. Public GETs are not currently rate limited. A separate full team UI on 127.0.0.1:3007 is reachable only through an authenticated SSH tunnel; it uses the existing full API, which stays on 127.0.0.1:3003. The public UI hides controls for ingestion, uploads, building, Q&A, revision, and lectures. Team operations use the existing Atlas dataset and can modify it; coordinate use with the team.

`host-caddy-public-demo.example` shows the replacement API site and new root site. Preserve any other existing host Caddy configuration; back up the original first and validate the full candidate before reloading. Deploy the backend with `PUBLIC_DEMO=true` before exposing the root and replace the API proxy policy at the same controlled rollout. Keep both API and UI ports bound to loopback, and AI internal. Never print or replace the environment file. Roll back by restoring the saved Caddyfile and previous API image/configuration, validating and reloading Caddy; retain all volumes and Atlas data. The previous configuration exposes more API routes, so rollback restores that exposure.

## Full team mode and feature audit

The team UI retains the complete interface and talks to the existing full API, never the public API. Both the team UI (`127.0.0.1:3007`) and full API (`127.0.0.1:3003`) are loopback-only on the server. A team member with authorized SSH access can run:

```sh
ssh -N -L 3007:127.0.0.1:3007 root@155.138.234.110
```

Then open `http://localhost:3007` on that member's computer. SSH authenticates and encrypts the connection; do not publish or forward port 3007 to untrusted networks. Team operations can modify the existing Atlas dataset. Public demo startup skips index creation and job recovery, and public requests use fixtures without writes.

The full API and UI implement hierarchy management, PDF/PPTX uploads and extraction, builds, question selection, attempts/readiness/trace, material Q&A, revision plans/paths, lecture transcription and corrections. Existing backend tests cover representative uploads, builds, adaptive selection, caching, revision and corrections; the production team UI and its full end-to-end flow must still be tested after deployment. In `FAKE_GEMINI=1`, AI outputs are deterministic fixtures rather than live generation, so arbitrary uploaded content, live speech transcription, embeddings, Q&A and generated questions must not be presented as verified real-Gemini capabilities. The real Gemini client has not been verified against the live API in this deployment; enabling it requires a separate credential, quota and security decision.
