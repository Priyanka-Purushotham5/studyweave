import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { createServer } from "node:http";
import AxeBuilder from "@axe-core/playwright";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const apiOrigin = process.env.TEST_API_ORIGIN;
let origin;
let server;
const chromeArgs = process.env.PLAYWRIGHT_SINGLE_PROCESS ? ["--single-process", "--no-zygote", "--disable-gpu"] : [];
const contentTypes = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".pdf": "application/pdf", ".mp3": "audio/mpeg" };
let browser;

before(async () => {
  server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      const file = path === "/" ? join(dist, "index.html") : path.startsWith("/assets/") ? join(dist, "assets", basename(path)) : join(dist, basename(path));
      res.writeHead(200, { "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream" });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  if (!chromeArgs.length) browser = await chromium.launch();
});
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });

async function open(t, viewport = { width: 1440, height: 920 }) {
  const instance = chromeArgs.length ? await chromium.launch({ args: chromeArgs }) : browser;
  const context = await instance.newContext({ viewport });
  const page = await context.newPage();
  t.after(async () => { await context.close(); if (chromeArgs.length) await instance.close(); });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  if (apiOrigin) await page.route(`${origin}/api/**`, async route => {
    const response = await route.fetch({ url: new URL(route.request().url().slice(origin.length), apiOrigin).href });
    return route.fulfill({ response });
  });
  await page.goto(origin);
  assert.equal(await page.title(), "StudyNova");
  await page.getByRole("link", { name: "StudyNova", exact: true }).waitFor();
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
  await page.getByRole("button", { name: "Material map", exact: true }).click();
  await page.locator(".react-flow").waitFor();
  // React Flow keeps nodes hidden until it has measured them; wait for the node before counting.
  await page.getByRole("button", { name: "Lecture 7 - Backpropagation", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Lecture 7 - Backpropagation", exact: true }).count(), 1);
  await page.getByRole("button", { name: "Collapse Backpropagation" }).click();
  assert.equal(await page.getByRole("button", { name: "Lecture 7 - Backpropagation", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Expand Backpropagation" }).click();
  await page.getByRole("button", { name: "Lecture 7 - Backpropagation", exact: true }).click();
  await page.getByRole("dialog", { name: "Lecture 7 - Backpropagation" }).waitFor();
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
    if (await options.count()) await options.nth(question.includes("chain rule let us compute") ? 1 : 0).click();
    else {
      await page.getByRole("textbox", { name: "Your answer" }).fill("My answer");
      await page.getByRole("button", { name: "Reveal answer" }).click();
      await page.getByRole("button", { name: "I got it" }).click();
    }
    await page.getByRole("button", { name: "Next question" }).click();
    await page.waitForFunction(previous => document.querySelector(".question")?.textContent !== previous, question);
  }
  const attemptResponse = page.waitForResponse(response => response.url().includes("/api/attempts") && response.request().method() === "POST");
  await page.getByRole("button", { name: "A Product rule" }).click();
  const attempt = await attemptResponse;
  assert.equal(attempt.status(), 200, `attempt: ${await attempt.text()}`);
  await page.getByRole("button", { name: "Show learning gap" }).click().catch(async error => {
    throw new Error(`${error.message}\nVisible error: ${await page.getByRole("alert").allInnerTexts()}`);
  });
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
  await page.getByRole("link", { name: "StudyNova", exact: true }).waitFor();
  await page.waitForFunction(() => document.documentElement.dataset.readable === "true");
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
  await mobile.getByRole("button", { name: "Material map", exact: true }).click();
  await mobile.locator(".react-flow").waitFor();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  const directory = process.env.STUDYWEAVE_SCREENSHOTS;
  if (directory) {
    await mkdir(directory, { recursive: true });
    await mobile.screenshot({ path: resolve(directory, "mobile.png"), fullPage: true });
    const desktop = await open(t);
    await desktop.screenshot({ path: resolve(directory, "desktop.png"), fullPage: true });
  }
});


test("key study screens have no serious accessibility violations", { skip: !!apiOrigin }, async t => {
  const page = await open(t);
  await page.getByRole("button", { name: "Material map", exact: true }).click();
  const mapAudit = await new AxeBuilder({ page }).analyze();
  assert.deepEqual(mapAudit.violations.filter(item => ["serious", "critical"].includes(item.impact)).map(item => item.id), [], "Material map");
  for (const screen of ["Study map", "Practice quiz", "Boss battle", "Lecture captions", "Revision plan"]) {
    await nav(page, screen).click();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(item => ["serious", "critical"].includes(item.impact));
    assert.deepEqual(serious.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), [], screen);
  }
});


test("concept flashcard exposes read-aloud when speech synthesis is available", async t => {
  const page = await open(t);
  await page.locator('[data-concept-id="c_chain_rule"]').click();
  const dialog = page.getByRole("dialog", { name: "Chain rule" });
  await dialog.waitFor();
  if (await page.evaluate(() => "speechSynthesis" in window)) {
    const button = dialog.getByRole("button", { name: "Read concept aloud" });
    await button.waitFor();
    await button.click();
  }
});
