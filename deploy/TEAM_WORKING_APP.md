# Team working application

The team site is the existing full UI and API, served over HTTPS behind Caddy Basic authentication. It is one shared workspace, not per-user accounts or tenant isolation. Keep `api.studynova.ink` on its restricted public-demo policy. The full API and AI service remain on private networks and loopback ports.

On the server, an operator can run `python3 /tmp/studynova-configure-team-secrets.py` to enter a shared username, a strong password and a Gemini API key without echoing the password or key. The helper stores a bcrypt hash in `/etc/caddy/studynova-team-auth.caddy` (root:caddy, 0640) and adds the key to the root-only deployment environment. It does not change running services or enable real Gemini.

After secrets are configured, preserve a backup of the host Caddyfile, add Basic authentication to the root site using `host-caddy-team.example`, validate the entire candidate with `caddy validate --adapter caddyfile`, then reload Caddy. Reconfigure Module A with `FAKE_GEMINI=0` and the saved Gemini key; only Module A receives the key. Preserve the existing Atlas database and all volumes. Verify anonymous requests receive 401, valid team access works, the public API policy remains restricted, and real AI flows work with a small test document. Real Gemini may incur quota usage or charges. Never print or commit credentials.

Roll back by restoring and validating the backed-up host Caddyfile and reloading it; restore `FAKE_GEMINI=1` in the server environment and recreate only the AI service if necessary. Coordinate the resulting brief AI interruption. Never delete the database or volumes.
