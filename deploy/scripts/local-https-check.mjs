// Requires the isolated studyweave-module-b-check stack already running on 3002.
// Creates and removes only a test Caddy container, local CA and temporary secrets.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), "studyweave-tls-"));
const password = randomBytes(24).toString("hex"),
  username = "demo";
const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
const hash = run("docker", [
  "run",
  "--rm",
  "caddy:2-alpine",
  "caddy",
  "hash-password",
  "--plaintext",
  password,
]).trim();
const envFile = join(dir, ".env"),
  override = join(dir, "https.yml"),
  ca = join(dir, "root.crt");
writeFileSync(envFile, `LOCAL_HASH='${hash}'\n`, { mode: 0o600 });
writeFileSync(
  override,
  `services:
  caddy:
    image: caddy:2-alpine
    environment:
      DOMAIN: localhost:3443
      API_USERNAME: demo
      API_PASSWORD_HASH: \${LOCAL_HASH}
    ports: ['127.0.0.1:3443:3443']
    volumes:
      - ${JSON.stringify(root + "/deploy/Caddyfile:/etc/caddy/Caddyfile:ro")}
      - tls_check_data:/data
      - tls_check_config:/config
    depends_on: [api]
volumes:
  tls_check_data:
  tls_check_config:
`,
  { mode: 0o600 },
);
const compose = [
  "compose",
  "--env-file",
  envFile,
  "-p",
  "studyweave-module-b-check",
  "-f",
  root + "/deploy/docker-compose.test.yml",
  "-f",
  override,
];
const env = { ...process.env, DEMO_API_PORT: "3002" };
try {
  run("docker", [...compose, "up", "-d", "caddy"], { env });
  const id = run("docker", [...compose, "ps", "-q", "caddy"], { env }).trim();
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const copy = spawnSync(
      "docker",
      ["cp", `${id}:/data/caddy/pki/authorities/local/root.crt`, ca],
      { stdio: "ignore" },
    );
    if (copy.status === 0) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(ready, "Local Caddy CA was not created");
  const base = "https://localhost:3443";
  let reachable = false;
  for (let i = 0; i < 40; i++) {
    const probe = spawnSync(
      "curl",
      [
        "--silent",
        "--cacert",
        ca,
        "--output",
        "/dev/null",
        "--write-out",
        "%{http_code}",
        base + "/healthz",
      ],
      { encoding: "utf8" },
    );
    if (probe.status === 0 && probe.stdout === "401") {
      reachable = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(
    reachable,
    "Caddy did not require authentication over trusted local HTTPS",
  );
  assert.equal(
    run("curl", [
      "--silent",
      "--cacert",
      ca,
      "--user",
      username + ":wrong",
      "--output",
      "/dev/null",
      "--write-out",
      "%{http_code}",
      base + "/healthz",
    ]),
    "401",
  );
  const untrusted = { ...process.env };
  delete untrusted.CURL_CA_BUNDLE;
  delete untrusted.SSL_CERT_FILE;
  delete untrusted.SSL_CERT_DIR;
  const rejected = spawnSync(
    "curl",
    ["--silent", "--max-time", "10", base + "/healthz"],
    { env: untrusted },
  );
  assert.notEqual(
    rejected.status,
    0,
    "An untrusted local CA unexpectedly passed the certificate check",
  );
  const output = run("bash", [root + "/scripts/smoke.sh", base], {
    env: { ...env, CURL_AUTH: username + ":" + password, CURL_CA_BUNDLE: ca },
  });
  assert(output.includes("TLS certificate verified"));
  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          "Caddyfile runtime",
          "unauthenticated 401",
          "wrong password 401",
          "untrusted certificate rejected",
          "trusted local HTTPS certificate and smoke checks",
        ],
        scope:
          "Local CA only; public-domain TLS remains a post-provisioning check",
      },
      null,
      2,
    ),
  );
} finally {
  spawnSync("docker", [...compose, "stop", "caddy"], { env, stdio: "ignore" });
  spawnSync("docker", [...compose, "rm", "-f", "caddy"], {
    env,
    stdio: "ignore",
  });
  spawnSync(
    "docker",
    [
      "volume",
      "rm",
      "studyweave-module-b-check_tls_check_data",
      "studyweave-module-b-check_tls_check_config",
    ],
    { stdio: "ignore" },
  );
  rmSync(dir, { recursive: true, force: true });
}
