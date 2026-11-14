# Module B deployment

No server, domain, Atlas cluster, paid service, or billing setting has been created or changed. These are operator-run instructions after infrastructure approval.

## Local containers

With Docker running, from repository root:

```sh
docker compose -f deploy/docker-compose.test.yml up --build -d
curl -X POST http://localhost:3000/api/dev/seed
ALLOW_HTTP=1 bash deploy/scripts/smoke.sh http://localhost:3000
# Stop and discard the ephemeral database:
docker compose -f deploy/docker-compose.test.yml down
```

This starts B with FakeAiClient and ephemeral MongoDB. A and C are absent from this repository; this compose file does not claim to test their implementations. `npm test` separately runs mongodb-memory-server and HTTP-adapter seam tests.

## Atlas and vectors

1. Create/use an approved Atlas cluster, database user, and network allowlist for the API host. Keep the URI only in ignored `.env` files. Use a narrowly scoped database user and TLS (`mongodb+srv://`).
2. Set `MONGODB_URI` and optionally `MONGODB_DB` in your environment. Install API dependencies with `cd api && npm ci`.
3. From repository root, run `node deploy/scripts/create-vector-index.mjs`. The index definition is `deploy/atlas-vector-index.json`: 768 dimensions, cosine similarity, and a moduleId pre-filter.
4. Confirm the search index is READY in Atlas before setting `VECTOR_MODE=atlas`. Default `VECTOR_MODE=cosine` works without a search tier. Atlas query/index failures fall back to in-process cosine search.

Index creation and actual Atlas search could not be validated without credentials/tier access. The fallback is exercised by integration tests.

## HTTPS deployment on an approved host

1. Provision or use an approved Linux host with Docker Engine and Compose. Permit inbound TCP 80 and 443. Point your already-approved domain's DNS A record at this host.
2. Check out branch `b/module-b-implementation` (or its reviewed/merged commit) on the host.
3. Run `cp deploy/.env.example deploy/.env`. Set `DOMAIN`, the real `MONGODB_URI`, `AI_MODE=http`, a reachable private `AI_SERVICE_URL`, and `CORS_ORIGIN` to the web app origin. Keep `VECTOR_MODE=cosine` until Atlas indexing is confirmed.
4. Set `API_USERNAME` and generate a password hash with `docker run --rm -it caddy:2-alpine caddy hash-password`. Put the hash in `deploy/.env` in single quotes so Compose preserves dollar signs: `API_PASSWORD_HASH='$2a$...'`. Caddy protects this single-user demonstration API with Basic authentication over HTTPS. The direct API port is not published.
5. Start: `docker compose -f deploy/docker-compose.yml up --build -d`. Caddy obtains/renews the certificate when DNS and ports are correct.
6. Seed if desired: `docker compose -f deploy/docker-compose.yml exec api node dist/seed.js`. The production HTTP seed endpoint stays disabled.
7. Run: `CURL_AUTH='your-user:your-password' bash deploy/scripts/smoke.sh https://your-domain m_backprop`. This checks liveness, tree, the HTTPS certificate, and two requests for stored verified questions.
8. Inspect logs: `docker compose -f deploy/docker-compose.yml logs --tail=100 api caddy`.

Production commands use Atlas persistence and Caddy certificate volumes. Back up Atlas independently. The process drains active jobs on shutdown (up to 30 seconds); interrupted jobs are marked failed on restart, interrupted extraction becomes unsupported, and interrupted lectures become failed. This deployment supports one API worker; jobs are not a distributed queue. Re-upload/rebuild explicitly after a failed interrupted operation; source bytes remain in GridFS. Re-uploading an unsupported resource retries extraction using the existing resource ID and stored source file.

Docker image execution, public TLS, DNS, Vultr, actual Atlas vector results, and the real A/B/C live stack remain external verification steps. The Docker daemon was stopped in the implementation environment. The Compose test configuration and smoke shell syntax were validated locally, and the smoke script ran against a real local seeded HTTP API.

## CI

`.github/workflows/ci.yml` runs the API build/tests and proposed-contract checks on Node 20. No secrets are required. Add Module A's pytest and Module C's vitest/jest-axe jobs when their owners supply those folders. GitHub branch protection must require the relevant checks; this cannot be configured in an unconnected local repository.
