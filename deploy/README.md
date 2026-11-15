# Module B deployment

For the same-origin UI image, Caddy routing, and browser verification, see [UI_DEPLOYMENT.md](UI_DEPLOYMENT.md).

For the next user-operated service steps, see [CLOUD_SETUP.md](CLOUD_SETUP.md). Local Docker build, A+B end-to-end flow, and Caddy TLS/authentication have now been tested. Public-domain TLS and Atlas still require your services.

No server, domain, Atlas cluster, paid service, or billing setting has been created or changed. These are operator-run instructions after infrastructure approval.

## Local containers

Local fake-stack commands require **no credentials**. With Docker running, from repository root:

```sh
DEMO_API_PORT=3002 docker compose -p studyweave-module-b-check -f deploy/docker-compose.test.yml up --build -d
curl -X POST http://localhost:3002/api/dev/seed
ALLOW_HTTP=1 bash scripts/smoke.sh http://localhost:3002
node deploy/scripts/demo-check.mjs http://localhost:3002 --allow-demo-writes
node deploy/scripts/local-https-check.mjs
# Stop and discard the ephemeral database:
DEMO_API_PORT=3002 docker compose -p studyweave-module-b-check -f deploy/docker-compose.test.yml down
```

This builds the merged A source with FAKE_GEMINI=1, B with its HTTP adapter, and ephemeral MongoDB. No Gemini key is needed. The separate web UI is available through the UI test overlay. `npm test` separately runs mongodb-memory-server and HTTP-adapter seam tests.

## Atlas and vectors

1. **[YOUR CREDENTIALS REQUIRED: Atlas account/database administration]** Create/use an approved Atlas cluster, database user, and network allowlist for the API host. Keep the URI only in ignored `.env` files. Use a narrowly scoped database user and TLS (`mongodb+srv://`).
2. **[YOUR CREDENTIALS REQUIRED: Atlas database URI/password]** Install dependencies with `npm --prefix api ci`, run `npm --prefix api run build`, then set `MONGODB_URI` and optionally `MONGODB_DB` in your environment. Keep this URI in your private environment settings.
3. **[YOUR CREDENTIALS REQUIRED: configured Atlas URI with index permissions]** From repository root, run `node deploy/scripts/create-vector-index.mjs`. The index definition is `deploy/atlas-vector-index.json`: 768 dimensions, cosine similarity, and a moduleId pre-filter.
4. **[YOUR CREDENTIALS REQUIRED: Atlas console access]** Confirm the search index is READY in Atlas before setting `VECTOR_MODE=atlas`. Default `VECTOR_MODE=cosine` works without a search tier. Atlas query/index failures fall back to in-process cosine search.

Index creation and actual Atlas search could not be validated without credentials/tier access. The fallback is exercised by integration tests.

## HTTPS deployment on an approved host

1. **[YOUR CREDENTIALS REQUIRED: cloud/SSH and DNS-provider access]** Provision or use an approved Linux host with Docker Engine and Compose. Permit inbound TCP 80 and 443. Point your already-approved domain's DNS A record at this host.
2. **[YOUR CREDENTIALS REQUIRED: SSH, private Git/registry access if applicable]** Check out branch `b/module-b-integration` (or its reviewed/merged commit) on the host.
3. **[YOUR CREDENTIALS REQUIRED: Atlas URI/password; Gemini key only for live mode]** Run `cp deploy/.env.example deploy/.env`. Set `DOMAIN`, the real `MONGODB_URI`, `GEMINI_API_KEY`, `AI_SERVICE_IMAGE`, and `CORS_ORIGIN` to the web app origin. Compose builds Priyanka’s merged Module A source using `ai-service/Dockerfile` (listening on `0.0.0.0:8001`); it does not modify that source. Compose fixes `AI_MODE=http` and `AI_SERVICE_URL=http://ai-service:8001`. Only the AI container receives the Gemini key. Keep FAKE_GEMINI=1 for the initial key-free deployed demo; switch to 0 and supply a key only for an approved live test. Keep `VECTOR_MODE=cosine` until Atlas indexing is confirmed.
4. **[YOUR CREDENTIALS REQUIRED: choose and retain your demo username/password]** Set `API_USERNAME` and generate a password hash with `docker run --rm -it caddy:2-alpine caddy hash-password`. Put the hash in `deploy/.env` in single quotes so Compose preserves dollar signs: `API_PASSWORD_HASH='$2a$...'`. Caddy protects this single-user demonstration API with Basic authentication over HTTPS. The direct API port is not published.
5. **[YOUR CREDENTIALS REQUIRED: SSH and configured Atlas credentials; Gemini only for live mode]** Run `bash deploy/scripts/preflight.sh deploy/.env`, then start: `docker compose --env-file deploy/.env -f deploy/docker-compose.yml up --build -d`. Caddy obtains/renews the certificate when DNS and ports are correct.
6. **[YOUR CREDENTIALS REQUIRED: SSH and configured Atlas URI]** Seed if desired: `docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec api node dist/seed.js`. The production HTTP seed endpoint stays disabled.
7. **[YOUR CREDENTIALS REQUIRED: demo HTTP username/password]** Run: `CURL_AUTH='your-user:your-password' bash deploy/scripts/smoke.sh https://your-domain m_backprop`. This checks liveness, tree, the HTTPS certificate using curl’s trust/hostname/expiry checks, and reuse of the same stored verified question across two requests. `scripts/smoke.sh` at the repository root forwards to the same implementation. HTTP bypass is local-test-only (`ALLOW_HTTP=1`); it explicitly reports that TLS was not tested.
8. **[YOUR CREDENTIALS REQUIRED: SSH host access]** Inspect logs: `docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs --tail=100 api caddy`.

The AI service is attached only to the private Docker `backend` bridge and publishes no host ports. Its `expose: 8001` is internal service discovery, not a public mapping. The bridge allows outbound access because Gemini and Atlas need it; Docker’s egress-blocking `internal: true` is intentionally not set. Only Caddy publishes ports 80/443.

Production commands use Atlas persistence and Caddy certificate volumes. Back up Atlas independently. The process drains active jobs on shutdown (up to 30 seconds); interrupted jobs are marked failed on restart, interrupted extraction becomes unsupported, and interrupted lectures become failed. This deployment supports one API worker; jobs are not a distributed queue. Re-upload/rebuild explicitly after a failed interrupted operation; source bytes remain in GridFS. Re-uploading an unsupported resource retries extraction using the existing resource ID and stored source file.

Public TLS, DNS, Vultr, actual Atlas vector results, and the real-Gemini A/B/C live stack remain external verification steps. The local Docker engine has now been started and the built A/B/Mongo containers passed runtime checks. Caddy passed authentication checks, trusted local-CA HTTPS smoke, and rejection of an untrusted certificate. The Compose test configuration and smoke shell syntax were validated locally, and the smoke script ran against a real local seeded HTTP API.

## CI

`.github/workflows/ci.yml` runs the API build/tests and proposed-contract checks on Node 20. No secrets are required. CI preserves Module A’s pytest job and shared Python fixture validation. The API job also starts key-free A and runs real HTTP seam tests. Add Module C’s vitest/jest-axe job when its implementation is supplied. GitHub branch protection must require the relevant checks; the repository owner configures those rules separately.
