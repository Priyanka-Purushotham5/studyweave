# Single authenticated team website

`https://studynova.ink` serves the existing full UI and API over HTTPS behind one host-Caddy Basic-auth layer. Three team members may use the same login simultaneously. They share one Atlas workspace and can change each other's data; this does not provide individual accounts or per-user isolation. `/api/*` travels through the same authenticated website. `api.studynova.ink` requires the same login, then returns 404 for all requests, so it cannot bypass the website's policy. Module A is internal; Module B and the UI container bind to loopback only. Production seeding is disabled.

## Shared credentials (operator action)

After copying `deploy/scripts/configure-team-secrets.py` from the reviewed release to `/tmp/studynova-configure-team-secrets.py` on the server, run this from your own terminal:

```sh
ssh -t -i ~/.ssh/studynova_vultr root@155.138.234.110 'python3 /tmp/studynova-configure-team-secrets.py'
```

Choose a username and enter a strong shared password twice; the password is not echoed. The helper stores only a bcrypt hash in `/etc/caddy/studynova-team-auth.caddy` (root:caddy, 0640). It does not modify running services, Atlas, the Gemini key or fake-mode setting. Share the login through a secure channel; never paste it into chat, logs or GitHub.

## Approved rollout and rollback

Before production changes, get the owner's explicit approval, back up the entire host Caddyfile and record image IDs. Save the existing environment file and volumes. Deploy the `docker-compose.yml` plus `docker-compose.single-site.yml` stack with `FAKE_GEMINI=1`; recreate only services that need updating. Build the UI with Node 22 in Docker. Replace the existing host sites with the equivalent of `host-caddy-team.example` while preserving unrelated directives, validate the full candidate with `caddy validate --adapter caddyfile`, and reload only if it succeeds. Verify 401 without credentials and with an incorrect password on both sites; the main site returns the application after successful login, while the API subdomain returns 404 even after login. Test full workflows using isolated test data, not existing records. No production DB or Docker volume deletion is required.

Rollback by restoring the saved Caddyfile, validating and reloading it, and restoring recorded images and Compose settings if needed. The prior policy is an anonymous fixture demo, so rollback changes access accordingly. Never delete volumes or Atlas data.

Full mode uses a global in-process 180 POST-per-minute API limit shared by the team. It resets on restart, is not distributed, and does not limit unauthenticated Basic-auth attempts at host Caddy. Apply network-level protections before wider deployment. Secure credentials are essential: all signed-in teammates have the same access, and Basic authentication does not provide individual revocation or auditing.

## Real Gemini

Keep `FAKE_GEMINI=1`. AI extraction, generated questions, material Q&A, embeddings and lecture transcription rely on Module A; fake mode uses deterministic fixtures and cannot establish real-model output quality on arbitrary material. Before real mode is enabled, confirm the key, supported model, quota, spend limits and actual end-to-end behavior in a separate approved test. Do not log or commit credentials.
