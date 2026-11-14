import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const base = process.env.UI_TEST_ORIGIN ?? "http://localhost:3006";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  httpCredentials: { username: "demo", password: "local-test-only" },
});
const page = await context.newPage();
const errors = [];
const calls = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  const u = new URL(r.url());
  if (u.origin === new URL(base).origin && u.pathname.startsWith("/api/"))
    calls.push({ path: u.pathname, status: r.status() });
});
try {
  await page.goto(base, { waitUntil: "networkidle" });
  if (process.env.UI_EXPECT_PUBLIC === "1") {
    for (const [method, path] of [["GET", "/readyz"], ["POST", "/api/dev/seed"], ["POST", "/api/ask"], ["DELETE", "/api/tree"], ["GET", "/api/openapi.json"]]) {
      assert.equal((await page.request.fetch(`${base}${path}`, { method })).status(), 404, `unexpected access: ${method} ${path}`);
    }
    for (const name of ["Add material", "Add a source", "Build concept web", "Ask materials", "Lecture captions", "Revision plan", "Create course, exam, or module"]) {
      assert.equal(await page.getByRole("button", { name, exact: true }).count(), 0, `unexpected public control: ${name}`);
    }
  }
  await page
    .getByRole("heading", { name: "Backpropagation", exact: true })
    .waitFor();
  await page.locator('[data-concept-id="c_chain_rule"]').waitFor();
  assert(
    calls.some((x) => x.path === "/api/tree" && x.status === 200),
    "tree was not loaded through Caddy",
  );
  assert(
    calls.some((x) => x.path === "/api/graph" && x.status === 200),
    "graph was not loaded through Caddy",
  );
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Practice quiz" })
    .click();
  const incoming = page.waitForResponse(
    (r) =>
      r.url().includes("/api/questions/next") &&
      r.request().method() === "POST" &&
      r.status() === 200,
  );
  await page.getByRole("button", { name: "Start quiz" }).click();
  const available = (await (await incoming).json()).questions;
  await page.locator(".question").waitFor();
  const visible = await page.locator(".question").innerText();
  const question = available.find((q) => q.text === visible);
  assert(question, "displayed question was not returned by the API");
  if (question.options.length) {
    const wrong = question.answer === "A" ? 1 : 0;
    await page.locator(".options button").nth(wrong).click();
  } else {
    await page
      .getByRole("textbox", { name: "Your answer" })
      .fill("I do not know");
    await page.getByRole("button", { name: "Reveal answer" }).click();
    await page.getByRole("button", { name: "I missed it" }).click();
  }
  await page.getByRole("button", { name: "Show learning gap" }).click();
  const heading = page.getByRole("heading", {
    name: /^(Likely|Possible) gap:/,
  });
  await heading.waitFor();
  const gap = await heading.innerText();
  if (process.env.UI_EXPECT_PUBLIC === "1")
    assert.equal(await page.getByRole("button", { name: "See revision path" }).count(), 0);
  assert((await page.locator(".trace-node").count()) >= 1);
  assert(
    calls.some((x) => x.path === "/api/attempts" && x.status === 200),
    "attempt was not posted through Caddy",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        ok: true,
        verified: [
          "browser loaded UI through Caddy",
          "seeded tree and graph loaded over same-origin API",
          "answered a real API question incorrectly",
          `${gap} appeared with highlighted trace nodes`,
          "no page errors",
        ],
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error("API calls:", JSON.stringify(calls));
  console.error(
    "Visible UI:",
    (await page.locator("body").innerText()).slice(-4000),
  );
  throw e;
} finally {
  await context.close();
  await browser.close();
}
