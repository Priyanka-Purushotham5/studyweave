import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const apiOrigin = process.env.TEST_API_ORIGIN;
const origin = "https://studyweave.test";
const chromeArgs = process.env.PLAYWRIGHT_SINGLE_PROCESS ? ["--single-process", "--no-zygote", "--disable-gpu"] : [];
const contentTypes = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".pdf": "application/pdf", ".mp3": "audio/mpeg" };
let browser;

before(async () => { if (!chromeArgs.length) browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function open(t, viewport = { width: 1440, height: 920 }) {
  const instance = chromeArgs.length ? await chromium.launch({ args: chromeArgs }) : browser;
  const page = await instance.newPage({ viewport });
  t.after(() => chromeArgs.length ? instance.close() : page.close());
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route(`${origin}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/")) {
      if (!apiOrigin) return route.fulfill({ status: 503, json: { error: { code: "ai_unavailable" } } });
      const response = await route.fetch({ url: new URL(route.request().url().slice(origin.length), apiOrigin).href });
      return route.fulfill({ response });
    }
    const file = path === "/" ? join(dist, "index.html") : path.startsWith("/assets/") ? join(dist, "assets", basename(path)) : join(dist, basename(path));
    await route.fulfill({ body: await readFile(file), contentType: contentTypes[extname(file)] });
  });
  await page.goto(origin);
  await page.getByRole("heading", { name: "Backpropagation", exact: true }).waitFor();
  await page.locator('[data-concept-id="c_chain_rule"]').waitFor();
  return page;
}

const nav = (page, label) => page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: label });

test("study map opens both source citations and supports keyboard navigation in the outline", async t => {
  const page = await open(t);
  await page.getByRole("button", { name: /Gradient descent to Backpropagation/ }).click();
  await page.getByRole("dialog", { name: "Concept connection" }).waitFor();
  assert.equal(await page.getByRole("dialog").getByRole("button", { name: /Page [13]/ }).count(), 2);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  const course = page.getByRole("treeitem", { name: "Neural Networks" });
  await course.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const mod = page.getByRole("treeitem", { name: "Backpropagation", exact: true });
  assert.equal(await mod.evaluate(item => item === document.activeElement), true);
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.getByRole("treeitem").count(), 3);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Lecture 7 - Backpropagation" }).waitFor();
});

test("missed quiz answer opens the Chain rule trace, cited evidence and revision plan", async t => {
  const page = await open(t);
  await nav(page, "Practice quiz").click();
  await page.getByRole("button", { name: "Start quiz" }).click();
  for (let i = 0; i < 8; i += 1) {
    await page.locator(".question").waitFor();
    const question = await page.locator(".question").innerText();
    if (question.includes("Which rule does backpropagation apply")) break;
    const options = page.locator(".options button");
    if (await options.count()) await options.first().click();
    else {
      await page.getByRole("textbox", { name: "Your answer" }).fill("My answer");
      await page.getByRole("button", { name: "Reveal answer" }).click();
      await page.getByRole("button", { name: "I got it" }).click();
    }
    await page.getByRole("button", { name: "Next question" }).click();
  }
  await page.getByRole("button", { name: "A Product rule" }).click();
  await page.getByRole("button", { name: "Show learning gap" }).click();
  await page.getByRole("heading", { name: "Likely gap: Chain rule" }).waitFor();
  assert.equal(await page.locator(".trace-node").count(), 2);
  await page.locator(".gap-panel").getByRole("button", { name: /Page 2/ }).click();
  await page.getByRole("dialog").getByText("“compute the derivative of a composite function by multiplying the derivatives of its parts”", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await nav(page, "Revision plan").click();
  const first = page.locator(".plan-list li").first();
  await first.waitFor();
  assert.match(await first.innerText(), /Chain rule/);
});

test("demo capture, caption correction, refusal and accessibility controls work", { skip: !!apiOrigin }, async t => {
  const page = await open(t);
  await page.getByRole("button", { name: "Add material", exact: true }).click();
  const upload = page.getByLabel("Choose PDF or PPTX");
  await upload.setInputFiles({ name: "scanned.pdf", buffer: Buffer.from("%PDF-1.4"), mimeType: "application/pdf" });
  await page.getByRole("dialog").getByRole("button", { name: "Add material" }).click();
  await page.getByRole("alert").getByText(/no selectable text/).waitFor();
  await upload.setInputFiles(fileURLToPath(new URL("../../fixtures/files/sample.pdf", import.meta.url)));
  await page.getByRole("dialog").getByRole("button", { name: "Add material" }).click();
  await page.getByRole("button", { name: /sample\.pdf/ }).waitFor();
  await nav(page, "Lecture captions").click();
  const fix = page.getByRole("button", { name: "Fix back propagation" });
  await fix.focus();
  await page.keyboard.press("Space");
  await page.getByText("Caption updated.").waitFor();
  assert.equal(await fix.count(), 0);
  await page.getByRole("button", { name: "Ask materials" }).click();
  await page.getByRole("textbox", { name: "Question" }).fill("Who won the World Cup?");
  await page.getByRole("button", { name: "Ask question" }).click();
  await page.getByText("Not in your materials.").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Accessibility" }).click();
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  assert.equal(await page.locator("html").getAttribute("data-contrast"), "true");
  assert.equal(await page.locator("html").getAttribute("data-readable"), "true");
  assert.equal(await page.locator("html").getAttribute("data-motion"), "true");
  await page.keyboard.press("Escape");
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("data-readable"), "true");
});

test("demo boss battle clears on four correct answers", { skip: !!apiOrigin }, async t => {
  const page = await open(t);
  await nav(page, "Boss battle").click();
  await page.getByRole("button", { name: "Start battle" }).click();
  await page.getByRole("textbox", { name: "Your answer" }).fill("Along the negative gradient.");
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await page.getByRole("button", { name: "I got it" }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "A To introduce non-linearity" }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "A The derivative of a composite function" }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "B Chain rule" }).click();
  await page.getByText("Boss defeated. Module cleared!").waitFor();
  await nav(page, "Study map").click();
  assert.match(await page.locator('[data-concept-id="c_chain_rule"]').innerText(), /Cleared/);
});

test("workspace fits a small viewport", async t => {
  const mobile = await open(t, { width: 390, height: 844 });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.equal(await mobile.getByRole("navigation", { name: "Workspace" }).getByRole("button").count(), 5);
  const canvas = await mobile.locator(".map-scroll").boundingBox();
  for (const node of await mobile.locator(".concept-node").all()) {
    const box = await node.boundingBox();
    assert.ok(box.x >= canvas.x && box.x + box.width <= canvas.x + canvas.width + 1);
  }
  const directory = process.env.STUDYWEAVE_SCREENSHOTS;
  if (directory) {
    await mkdir(directory, { recursive: true });
    await mobile.screenshot({ path: resolve(directory, "mobile.png"), fullPage: true });
    const desktop = await open(t);
    await desktop.screenshot({ path: resolve(directory, "desktop.png"), fullPage: true });
  }
});
