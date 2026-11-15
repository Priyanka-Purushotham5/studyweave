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

test("extension captures through a signed-in app tab and preserves its selection", async t => {
  let listener;
  let server = "https://first.example";
  let available = true;
  let responseStatus = 200;
  let changedOrigin = false;
  const requests = [];
  const writes = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url: String(url), body: options.body && JSON.parse(options.body), credentials: options.credentials, redirect: options.redirect });
    return Response.json(url === "/api/tree" ? { subjects: [] } : { ok: true }, { status: responseStatus });
  });
  globalThis.chrome = {
    runtime: { id: "addon", onMessage: { addListener(callback) { listener = callback; } } },
    storage: { local: { get: async () => ({ server }), set: async value => writes.push(value) } },
    tabs: {
      get: async () => ({ url: "https://example.com/notes", title: "Notes" }),
      query: async () => available ? [{ id: 2, status: "complete", url: server + "/" }] : [],
    },
    scripting: { executeScript: async options => {
      if (options.world === "MAIN") {
        globalThis.location = { origin: changedOrigin ? "https://other.example" : server };
        return [{ result: await options.func(...options.args) }];
      }
      return [{ result: { url: "https://example.com/notes", title: "Notes", text: "Backpropagation." } }];
    } },
  };
  t.after(() => { delete globalThis.chrome; delete globalThis.location; });
  await import("../../extension/worker.js");
  const call = message => new Promise(resolve => listener(message, { id: "addon" }, resolve));
  assert.deepEqual(await call({ action: "tree" }), { result: { subjects: [] } });
  server = "https://second.example";
  const lastSelection = { subjectId: "s_nn", examId: "e_midterm", moduleId: "m_backprop" };
  assert.deepEqual(await call({ action: "save", tabId: 1, ...lastSelection }), { result: { ok: true } });
  assert.deepEqual(requests.map(request => request.url), ["/api/tree", "/api/resources"]);
  assert(requests.every(request => request.credentials === "same-origin" && request.redirect === "error"));
  assert.deepEqual(requests[1].body, { moduleId: "m_backprop", type: "web", url: "https://example.com/notes", title: "Notes", text: "Backpropagation." });
  assert.deepEqual(writes, [{ lastSelection }]);
  responseStatus = 401;
  assert.match((await call({ action: "tree" })).error, /sign in/i);
  responseStatus = 403;
  assert.match((await call({ action: "tree" })).error, /rejected/i);
  responseStatus = 200;
  changedOrigin = true;
  const count = requests.length;
  assert.match((await call({ action: "tree" })).error, /tab changed/i);
  assert.equal(requests.length, count);
  available = false;
  assert.match((await call({ action: "tree" })).error, /sign in/i);
});
