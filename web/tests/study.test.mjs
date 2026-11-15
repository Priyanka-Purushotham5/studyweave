import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { startBattle, nextAttack, recordAttack } from "../src/lib/battleEngine.ts";
import { applyCorrection, colorFor, treeToNodes } from "../src/lib/study.ts";
import { capturePayload, retryNetwork, selection, serverAddress, suggestModule } from "../../extension/capture.js";

const fixture = name => JSON.parse(readFileSync(new URL(`../../fixtures/${name}.json`, import.meta.url)));
const tree = fixture("tree");
const lecture = fixture("lecture");

test("material map excludes a collapsed module’s descendants", () => {
  const full = treeToNodes(tree);
  assert.equal(full.nodes.length, 7);
  assert.equal(full.edges.length, 6);
  const collapsed = treeToNodes(tree, new Set(["m_backprop"]));
  assert.deepEqual(collapsed.nodes.map(item => item.kind), ["subject", "exam", "module"]);
  assert.equal(collapsed.edges.length, 2);
});

test("readiness boundaries have unique text and icons", () => {
  const states = [colorFor(null), colorFor(39), colorFor(40), colorFor(70), colorFor(80, true)];
  assert.deepEqual(states.map(item => item.label), ["Untested", "Weak", "Developing", "Strong", "Cleared"]);
  assert.equal(colorFor(69).key, "developing");
  assert.equal(new Set(states.map(item => item.icon)).size, 5);
});

test("caption correction keeps the timing span and shifts later flags", () => {
  const { words, flags } = applyCorrection(lecture.words, lecture.flags, 1, 3, "Backpropagation");
  assert.deepEqual(words[1], { w: "Backpropagation", startSec: 0.5, endSec: 1.4 });
  assert.deepEqual(flags.map(({ id, startIdx, endIdx }) => [id, startIdx, endIdx]), [["f2", 8, 10]]);
  assert.throws(() => applyCorrection(words, flags, 2, 2, "x"));
});

test("boss health, hearts and XP come from the submitted attempts", () => {
  let won = startBattle(["root", "original"]);
  for (let step = 0; step < 2; step++) won = recordAttack(won, nextAttack(won), true, 10);
  assert.deepEqual([won.remaining.length, won.hearts, won.xp, nextAttack(won)], [0, 3, 20, undefined]);
  let lost = startBattle(["original"]);
  for (let step = 0; step < 3; step++) lost = recordAttack(lost, nextAttack(lost), false, 0);
  assert.equal(lost.hearts, 0);
  assert.equal(nextAttack(lost), undefined);
});

test("battle prioritizes prerequisite and missed concepts, then adjusts difficulty", () => {
  const first = { conceptId: "original", difficulty: 3 };
  let battle = recordAttack(startBattle(["original", "unseen"]), first, false, 0, "root");
  assert.deepEqual(nextAttack(battle), { conceptId: "root", difficulty: 1 });
  battle = recordAttack(battle, nextAttack(battle), true, 10);
  assert.deepEqual(nextAttack(battle), { conceptId: "original", difficulty: 2 });
  battle = recordAttack(battle, nextAttack(battle), true, 10);
  battle = recordAttack(battle, { conceptId: "original", difficulty: 2 }, true, 10);
  assert.equal(battle.levels.original.difficulty, 3);
  assert.equal(battle.xp, 30);
});

test("extension remembers selection, recovers a stale module and builds a capture", () => {
  assert.equal(selection(tree, { moduleId: "gone" }).module.id, "m_backprop");
  const page = { url: "https://example.com/backpropagation", title: "Backpropagation notes", text: "A short note." };
  assert.equal(suggestModule(tree, page).moduleId, "m_backprop");
  assert.deepEqual(capturePayload("m_backprop", page), { moduleId: "m_backprop", type: "web", ...page });
  assert.equal(capturePayload("m_backprop", { ...page, url: "https://youtu.be/123" }).type, "youtube");
  assert.throws(() => capturePayload("m_backprop", { url: "file:///private" }));
  assert.throws(() => serverAddress("http://example.com"));
});

test("extension retries a network failure once", async () => {
  let attempts = 0;
  assert.equal(await retryNetwork(async () => {
    if (++attempts === 1) throw new TypeError("Network failure");
    return "saved";
  }), "saved");
  assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(retryNetwork(async () => { attempts++; throw new TypeError("Offline"); }), /Offline/);
  assert.equal(attempts, 2);
});

test("extension worker loads settings on each message and persists successful captures", async t => {
  let listener;
  let server = "https://first.example";
  const requests = [];
  const writes = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url: String(url), body: options.body && JSON.parse(options.body) });
    if (requests.length === 2) throw new TypeError("temporary network failure");
    return Response.json({ ok: true });
  });
  globalThis.chrome = {
    runtime: { id: "addon", onMessage: { addListener(callback) { listener = callback; } } },
    storage: {
      local: { get: async () => ({ server }), set: async value => writes.push(value) },
      session: { get: async () => ({}) },
    },
    tabs: { get: async () => ({ url: "https://example.com/notes", title: "Notes" }) },
    scripting: { executeScript: async () => [{ result: { url: "https://example.com/notes", title: "Notes", text: "Backpropagation." } }] },
  };
  t.after(() => { delete globalThis.chrome; });
  await import("../../extension/worker.js");
  const call = message => new Promise(resolve => listener(message, { id: "addon" }, resolve));
  assert.deepEqual(await call({ action: "tree" }), { result: { ok: true } });
  server = "https://second.example";
  const lastSelection = { subjectId: "s_nn", examId: "e_midterm", moduleId: "m_backprop" };
  assert.deepEqual(await call({ action: "save", tabId: 1, ...lastSelection }), { result: { ok: true } });
  assert.deepEqual(requests.map(request => request.url), ["https://first.example/api/tree", "https://second.example/api/resources", "https://second.example/api/resources"]);
  assert.deepEqual(requests[2].body, { moduleId: "m_backprop", type: "web", url: "https://example.com/notes", title: "Notes", text: "Backpropagation." });
  assert.deepEqual(writes, [{ lastSelection }]);
});

test("extension signs in to the selected HTTPS API and keeps credentials in the browser session", async t => {
  let listener;
  const origin = "https://study.example";
  const authorization = "Basic " + Buffer.from("demo:tést:password").toString("base64");
  const local = { server: origin };
  const session = {};
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url: url.href, ...options });
    if (url.origin === origin && options.headers.Authorization !== authorization) {
      return new Response(null, { status: 401 });
    }
    return Response.json(url.pathname === "/api/tree" ? tree : { ok: true });
  });
  const storage = data => ({
    get: async key => ({ [key]: data[key] }),
    set: async value => Object.assign(data, value),
    remove: async key => { delete data[key]; },
  });
  globalThis.chrome = {
    runtime: { id: "addon", onMessage: { addListener(callback) { listener = callback; } } },
    storage: { local: storage(local), session: storage(session) },
    tabs: { get: async () => ({ url: "https://example.com/notes", title: "Notes" }) },
    scripting: { executeScript: async () => [] },
  };
  t.after(() => { delete globalThis.chrome; });
  await import("../../extension/worker.js?auth");
  const call = message => new Promise(resolve => listener(message, { id: "addon" }, resolve));
  assert.equal((await call({ action: "tree" })).status, 401);
  assert.equal((await call({ action: "connect", server: origin, username: "demo", password: "wrong" })).status, 401);
  assert.deepEqual(session, {});
  assert.match((await call({ action: "connect", server: "http://localhost:3000", username: "demo", password: "secret" })).error, /HTTPS/);
  assert.equal(requests.length, 2);

  assert.deepEqual((await call({ action: "connect", server: origin, username: "demo", password: "tést:password" })).result, tree);
  assert.deepEqual(local, { server: origin });
  assert.deepEqual(session.login, { origin, authorization });
  assert.deepEqual((await call({ action: "tree" })).result, tree);
  assert.deepEqual((await call({ action: "save", tabId: 1, moduleId: "m_backprop" })).result, { ok: true });
  assert.deepEqual(requests.slice(2).map(request => [request.headers.Authorization, request.redirect]), [
    [authorization, "error"], [authorization, "error"], [authorization, "error"],
  ]);
  assert.equal(requests.at(-1).headers["Content-Type"], "application/json");
  local.server = "https://different.example";
  await call({ action: "tree" });
  assert.equal(requests.at(-1).headers.Authorization, undefined);
  assert.equal(requests.at(-1).credentials, "include");
});
