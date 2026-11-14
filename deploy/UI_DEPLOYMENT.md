# Same-origin web deployment

The Caddy image is built by `deploy/Web.Dockerfile`: Node 22 runs `npm ci` and the production Vite build, then copies only `web/dist` into the Caddy image. `VITE_API_URL` is empty and `VITE_MOCK=0`, so browsers use same-origin `/api` calls. Caddy proxies `/api/*`, `/healthz`, and `/readyz` to B and serves the SPA with `index.html` fallback. Existing Basic authentication remains enabled. No Node installation is needed on the host.

## Local verification

Use Node 22 and Docker. This creates a separate disposable MongoDB database and writes demo attempts to it, not Atlas:

```sh
npm --prefix web ci
npx --prefix web playwright install chromium --only-shell
export UI_TEST_HASH="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext local-test-only)"
export DEMO_API_PORT=3005
docker compose -p studynova-ui-verify -f deploy/docker-compose.test.yml -f deploy/docker-compose.ui-test.yml up --build -d
curl -u demo:local-test-only -X POST http://localhost:3006/api/dev/seed
node deploy/scripts/ui-browser-check.mjs
# This removes only the disposable test project's containers and volume:
docker compose -p studynova-ui-verify -f deploy/docker-compose.test.yml -f deploy/docker-compose.ui-test.yml down -v
```

The browser check opens the actual Docker-built UI via Caddy, confirms tree and graph requests use that origin, answers an API-provided question incorrectly, and checks a trace is displayed. The test credentials above are for local verification only.

## Public deployment prerequisites

The owned domain's root A record must point to the Vultr server. Remove parking records only after confirming they are not needed. Ensure the host and Vultr firewalls allow TCP 80/443; API and AI ports remain unpublished. Configure an actual `API_USERNAME` and Caddy bcrypt `API_PASSWORD_HASH` in the ignored server environment. Caddy automatically obtains the public certificate after DNS resolves and ports are reachable. Do not use the local test credentials for the deployed app.

Once DNS and credentials are ready, rebuild with `docker compose --env-file deploy/.env -f deploy/docker-compose.yml up --build -d` and run the HTTPS smoke check. The existing Atlas database does not need reseeding. Real Gemini remains a separate key/quota decision.
