# Cloud setup, after local code verification

No paid resource has been created. Follow this order: local verification → Atlas → Atlas checks → approved Vultr host → public TLS/live checks. Do not upgrade a cluster, choose a paid plan, register a domain or change billing without Danush's explicit approval.

## 1. MongoDB Atlas — your next action

**YOUR ACCOUNT/CREDENTIALS REQUIRED.** In your Atlas account:

1. Create a project such as `StudyWeave Demo` and a **Free** cluster. Select a region convenient for your team; no paid upgrade is required for the default cosine fallback. Do not load unrelated sample data.
2. Create a database user (different from your Atlas login), for example `studyweave_api`, with `readWrite` on the `studyweave` database. Save its password privately.
3. In Network Access, allow your current laptop IP. Add the approved Vultr host's IP later; avoid opening the database to every IP.
4. Copy the Node.js driver connection URI and replace its password placeholder locally, encoding special password characters as required by the URI. Save it in **`api/.env`**, never in chat or Git:

   ```dotenv
   MONGODB_URI=mongodb+srv://YOUR_USER:YOUR_ENCODED_PASSWORD@YOUR_CLUSTER/
   MONGODB_DB=studyweave
   AI_MODE=http
   AI_SERVICE_URL=http://127.0.0.1:8001
   ```

   Protect the file with `chmod 600 api/.env`.
5. Tell the agent **“Atlas ready”**. Do not paste the URI or password. The agent can read the ignored local file without printing its values.

**You do not need to create databases, collections, normal indexes or seed rows manually.** Module B creates its database collections/indexes on connection and seeds the agreed fixtures when explicitly requested.

Official setup: [Deploy a Free Cluster](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/) and [Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/).

## 2. Checks we run once Atlas is ready

**YOUR SAVED DATABASE CREDENTIALS REQUIRED.** Node 20.19+ must be active. From repository root:

```sh
npm --prefix api ci
npm --prefix api run build
node --env-file=api/.env api/dist/checkDatabase.js
node --env-file=api/.env api/dist/seed.js
node --env-file=api/.env api/dist/setupVector.js
```

The first command checks connectivity and creates ordinary indexes. The seed is idempotent and is intended for this isolated demo database. It includes clearly labelled synthetic attempt histories that reproduce the fixture readiness/trace response, not real learner observations.

The vector command is idempotent: it reuses the matching 768-dimensional index, waits for queryability, and refuses to silently replace a different definition. If the tier/permissions do not support it, keep `VECTOR_MODE=cosine`; **do not upgrade or buy a tier automatically**. Atlas index readiness/query results remain unverified until these steps run against your account.

Vector deployment guidance: [MongoDB Vector Search deployment options](https://www.mongodb.com/docs/vector-search/deployment/deployment-options/).

We then run the A+B demo checks against the Atlas-backed API. These checks intentionally submit demo attempts, uploads and corrections and must not run against a real learner database without approval.

## 3. Vultr — wait until Atlas tests pass

**YOUR CLOUD ACCOUNT, APPROVED PLAN/CREDITS, SSH AND DNS ACCESS REQUIRED.** We will agree on a plan before creating it. No GPU is needed: Module A makes HTTP model calls, and MongoDB stays in Atlas. A CPU-only Ubuntu host with enough memory for Docker builds and both application services is sufficient; confirm the actual plan cost/credits in your account before provisioning.

When ready:

1. Create or select the approved Ubuntu host and attach your SSH public key. Keep its private key on your machine; do not paste it into chat. Supply the host IP, SSH username and local key path (or use your SSH agent).
2. Apply a Vultr firewall: permit SSH from your IP, and TCP 80/443 for public HTTPS. Do not publish API 3000, AI 8001, or MongoDB ports.
3. Add the host IP to the Atlas IP access list.
4. Point an **already-owned** domain/subdomain's A record at the host. If you have no domain, tell us before any registration/purchase.
5. Install Docker/Compose on that host, check out the reviewed B branch, and create private `deploy/.env` settings using `deploy/.env.example`. Preserve the actual password hash's dollar signs by single-quoting it in that file.

Official host setup: [Vultr SSH](https://docs.vultr.com/products/compute/instances/cloud-compute/connection/openssh) and [Vultr firewall](https://docs.vultr.com/products/compute/instances/cloud-compute/networking/enable-firewall).

## 4. Deploy and validate

**YOUR SERVER ACCESS AND PRIVATE ENVIRONMENT SETTINGS REQUIRED.** First deploy explicitly in key-free mode (`FAKE_GEMINI=1`). Real Gemini is a separate approved test because it uses your key/quota.

```sh
bash deploy/scripts/preflight.sh deploy/.env
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up --build -d
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec api node dist/checkDatabase.js
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec api node dist/seed.js
# Optional; remain on cosine if Atlas indexing cannot be verified:
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec api node dist/setupVector.js
```

Set `CURL_AUTH` privately to the demo HTTP username/password, then run:

```sh
bash scripts/smoke.sh https://YOUR_DOMAIN
node deploy/scripts/demo-check.mjs https://YOUR_DOMAIN --allow-demo-writes
```

The smoke check verifies the public HTTPS certificate, tree, liveness and repeated stored-question retrieval. The demo check additionally exercises real fixture PDF extraction, build jobs, graph evidence, adaptive root practice, root-cause tracing, revision budgets and correction persistence. The default fake service is fixture-driven; semantic model quality and arbitrary-question refusal must be measured separately with real A/model calls.

For a live test, **YOUR GEMINI KEY/QUOTA APPROVAL REQUIRED**: set `FAKE_GEMINI=0` and `GEMINI_API_KEY` only in the server's ignored `deploy/.env`, then recreate A. The startup guard refuses real mode without a key. Keys are passed only to A; B never calls Gemini directly. Do not run the deterministic fake acceptance suite against real mode and expect fixture equality.
