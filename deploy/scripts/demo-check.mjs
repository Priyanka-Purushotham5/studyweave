import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
if (!process.argv.includes("--allow-demo-writes"))
  throw new Error(
    "This check submits demo attempts/uploads/corrections. Add --allow-demo-writes only for an isolated seeded demo database.",
  );
const base = process.argv[2] || "http://127.0.0.1:3002";
const auth = process.env.CURL_AUTH
  ? {
      authorization:
        "Basic " + Buffer.from(process.env.CURL_AUTH).toString("base64"),
    }
  : {};
async function call(path, body) {
  const form = body instanceof FormData;
  const result = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...auth,
      ...(body !== undefined && !form
        ? { "content-type": "application/json" }
        : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  assert(result.ok, `${path}: HTTP ${result.status}`);
  return result.json();
}
async function wait(path) {
  const until = Date.now() + 120000;
  while (Date.now() < until) {
    const state = await call(path);
    if (state.status === "done") return;
    if (state.status === "failed")
      throw new Error(state.error || `${path} failed`);
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out: ${path}`);
}
const checks = [];
assert((await call("/healthz")).ok);
assert((await call("/readyz")).ok);
checks.push("health and Mongo readiness");
if (process.argv.includes("--seed")) await call("/api/dev/seed", {});
const tree = await call("/api/tree");
assert(tree.subjects.length);
checks.push("shared tree");
const moduleId = "m_backprop",
  root = "c_chain_rule",
  target = "c_backpropagation";
const q = (
  await call("/api/questions/next", {
    moduleId,
    conceptId: target,
    kind: "mcq",
    n: 1,
  })
).questions[0];
assert(q?.verified);
const again = (
  await call("/api/questions/next", {
    moduleId,
    conceptId: target,
    kind: "mcq",
    n: 1,
  })
).questions[0];
assert.equal(again.id, q.id);
checks.push("stored verified question reuse");
const attempt = await call("/api/attempts", {
  questionId: q.id,
  conceptId: target,
  correct: false,
});
assert.equal(attempt.trace.rootConceptId, root);
assert.equal(attempt.trace.status, "likely");
checks.push("wrong attempt and likely root trace");
const path = await call("/api/revision-path?conceptId=" + target);
assert.deepEqual(
  path.map((p) => p.kind),
  ["review", "practice", "retry"],
);
assert.equal(path[1].n, 2);
checks.push("root-first revision path");
const practice = (
  await call("/api/questions/next", {
    moduleId,
    conceptId: root,
    kind: "mcq",
    difficulty: 1,
    n: 2,
  })
).questions;
assert.equal(practice.length, 2);
assert.equal(new Set(practice.map((q) => q.text)).size, 2);
assert(practice.every((q) => q.verified && q.difficulty === 1));
checks.push("two distinct verified basic questions");
const pdf = readFileSync(
  new URL("../../fixtures/files/sample.pdf", import.meta.url),
);
const form = new FormData();
form.append("moduleId", moduleId);
form.append("tag", "notes");
form.append("file", new Blob([pdf], { type: "application/pdf" }), "sample.pdf");
const resource = await call("/api/resources/upload", form);
await wait("/api/resources/" + resource.id + "/status");
const file = await fetch(base + "/api/resources/" + resource.id + "/file", {
  headers: { ...auth, Range: "bytes=0-4" },
});
assert.equal(file.status, 206);
assert.equal(await file.text(), "%PDF-");
checks.push("real PDF extraction, status and GridFS range");
const build = await call("/api/modules/" + moduleId + "/build", {});
await wait("/api/jobs/" + build.jobId);
const graph = await call("/api/graph");
assert.equal(graph.nodes.length, 4);
assert.equal(graph.edges.length, 2);
assert(graph.edges.every((e) => e.evidence.from.quote && e.evidence.to.quote));
checks.push("HTTP A/B graph build and two-sided evidence");
const plan = await call("/api/revision-plan?examId=e_midterm&minutesPerDay=30");
assert(plan.reduce((n, c) => n + c.minutes, 0) <= 30);
assert(plan.every((c) => c.minutes >= 5));
checks.push("budgeted revision plan");
for (let i = 0; i < 3; i++) {
  const audio = new FormData();
  audio.append("moduleId", moduleId);
  audio.append("slidesResourceId", "r1");
  audio.append(
    "audio",
    new Blob([Buffer.from("fixture-audio")], { type: "audio/wav" }),
    "clip.wav",
  );
  const started = await call("/api/lectures", audio);
  await wait("/api/jobs/" + started.jobId);
  const lecture = await call("/api/lectures/" + started.lectureId);
  assert.equal(lecture.status, "done");
  const flag = lecture.flags.find((f) => f.heard === "back propagation");
  if (i < 2 && flag) {
    const fixed = await call(
      "/api/lectures/" + started.lectureId + "/corrections",
      { flagId: flag.id },
    );
    assert(fixed.words.some((w) => w.w.toLowerCase() === "backpropagation"));
  } else {
    assert(!flag);
    assert(lecture.words.some((w) => w.w.toLowerCase() === "backpropagation"));
  }
}
checks.push("lecture correction persistence and learned auto-fix");
console.log(JSON.stringify({ ok: true, base, checks }, null, 2));
