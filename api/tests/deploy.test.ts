import { it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(
  new URL("../../deploy/scripts/check-compose.mjs", import.meta.url),
);
function config() {
  return {
    services: {
      "ai-service": { environment: { FAKE_GEMINI: "1", GEMINI_API_KEY: "" } },
      api: {
        environment: {
          AI_SERVICE_URL: "http://ai-service:8001",
          NODE_ENV: "production",
          ENABLE_DEV_SEED: "false",
          MONGODB_URI:
            "mongodb+srv://demo-user:demo-password@cluster.invalid/studyweave",
        },
      },
      caddy: {
        ports: [{ published: "443" }],
        environment: {
          DOMAIN: "demo.example.net",
          API_PASSWORD_HASH: "$2a$12$demonstration-only",
        },
      },
    },
  };
}
function check(value: any) {
  return spawnSync(process.execPath, [script], {
    input: JSON.stringify(value),
    encoding: "utf8",
  });
}
it("allows a key-free production-shaped demo config without printing its settings", () => {
  const result = check(config());
  expect(result.status).toBe(0);
  expect(result.stdout).not.toContain("demo-password");
});
it.each([
  "published-ai",
  "published-api",
  "leaked-key",
  "seed-enabled",
  "wrong-ai-host",
  "missing-key",
])("preflight rejects %s", (kind) => {
  const c: any = config();
  if (kind === "published-ai")
    c.services["ai-service"].ports = [{ published: "8000" }];
  if (kind === "published-api") c.services.api.ports = [{ published: "3000" }];
  if (kind === "leaked-key")
    c.services.api.environment.GEMINI_API_KEY = "not-a-real-key";
  if (kind === "seed-enabled")
    c.services.api.environment.ENABLE_DEV_SEED = "true";
  if (kind === "wrong-ai-host")
    c.services.api.environment.AI_SERVICE_URL = "http://localhost:8001";
  if (kind === "missing-key")
    c.services["ai-service"].environment.FAKE_GEMINI = "0";
  expect(check(c).status).not.toBe(0);
});
