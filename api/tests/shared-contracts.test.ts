import { it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { readFileSync } from "node:fs";
import { connect } from "../src/db/store.js";
import { seed } from "../src/services/seed.js";
import { fixture } from "../src/services/sharedFixtures.js";
import { FakeAiClient } from "../src/ai/aiClient.js";
import { createApp } from "../src/app.js";
import { sharedValidator } from "../src/contracts/shared.js";
let mongo: MongoMemoryServer,
  connection: Awaited<ReturnType<typeof connect>>,
  ctx: ReturnType<typeof createApp>;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create({
    binary: { version: "7.0.14", downloadDir: "/tmp/studyweave-mongodb" },
  });
  connection = await connect(mongo.getUri());
  await seed(connection.store);
  ctx = createApp(connection.store, new FakeAiClient(), { enableSeed: true });
  await ctx.jobs.recover();
}, 120000);
afterAll(async () => {
  await ctx?.jobs.drain();
  await connection?.client.close();
  await mongo?.stop();
});
it("validates every shared mapped fixture with AJV 2020-12", () => {
  const map = JSON.parse(
    readFileSync(
      new URL("../../contracts/fixtures.map.json", import.meta.url),
      "utf8",
    ),
  );
  for (const [file, name] of Object.entries(map)) {
    const value = JSON.parse(
      readFileSync(new URL("../../" + file, import.meta.url), "utf8"),
    );
    const validate = sharedValidator(name as string);
    expect(validate(value), `${file}: ${JSON.stringify(validate.errors)}`).toBe(
      true,
    );
  }
});
it("public tree and graph equal the agreed fixtures after idempotent seed", async () => {
  await seed(connection.store);
  expect((await request(ctx.app).get("/api/tree")).body).toEqual(
    fixture("tree"),
  );
  expect(
    (await request(ctx.app).get("/api/graph?subjectId=s_nn")).body,
  ).toEqual(fixture("graph"));
});
it("serves shared root questions, attempts and missed-to-root traces", async () => {
  const next = await request(ctx.app).post("/api/questions/next").send({
    moduleId: "m_backprop",
    conceptId: "c_chain_rule",
    difficulty: 1,
    n: 1,
  });
  expect(next.status).toBe(200);
  expect(next.body.questions[0].id).toBe("q_chain_rule_1");
  const attempt = await request(ctx.app).post("/api/attempts").send({
    questionId: "q_backprop_1",
    conceptId: "c_backpropagation",
    correct: false,
  });
  expect(attempt.status).toBe(200);
  expect(sharedValidator("AttemptResponse")(attempt.body)).toBe(true);
  expect(attempt.body.trace.path).toEqual([
    "c_backpropagation",
    "c_chain_rule",
  ]);
  expect(attempt.body.trace.evidence).toEqual(fixture("trace").evidence);
});
it("rejects n above the shared contract maximum", async () =>
  expect(
    (
      await request(ctx.app)
        .post("/api/questions/next")
        .send({ moduleId: "m_backprop", n: 21 })
    ).status,
  ).toBe(400));
it("does not leak metadata from resources, jobs or lectures", async () => {
  const res = await request(ctx.app)
    .post("/api/resources/upload")
    .field("moduleId", "m_backprop")
    .field("tag", "notes")
    .attach("file", Buffer.from("%PDF-1.7 demo"), "demo.pdf");
  expect(res.status).toBe(201);
  expect(sharedValidator("Resource")(res.body)).toBe(true);
  expect(res.body.hash).toBeUndefined();
  await ctx.jobs.drain();
  const b = await request(ctx.app).post("/api/modules/m_backprop/build");
  await ctx.jobs.drain();
  const job = await request(ctx.app).get("/api/jobs/" + b.body.jobId);
  expect(sharedValidator("JobStatus")(job.body)).toBe(true);
  expect(job.body.id).toBeUndefined();
  const l = await request(ctx.app)
    .post("/api/lectures")
    .field("moduleId", "m_backprop")
    .field("slidesResourceId", "r1")
    .attach("audio", Buffer.from("audio"), "audio.wav");
  await ctx.jobs.drain();
  const lecture = await request(ctx.app).get(
    "/api/lectures/" + l.body.lectureId,
  );
  expect(sharedValidator("Lecture")(lecture.body)).toBe(true);
  expect(lecture.body.audioFileId).toBeUndefined();
});
it("synthetic demo histories reproduce every agreed readiness and the exact wrong-answer fixture", async () => {
  const db = await connect(mongo.getUri(), "history_acceptance");
  try {
    await seed(db.store);
    await seed(db.store);
    const ctx = createApp(db.store, new FakeAiClient());
    const { readiness } = await import("../src/services/learning.js");
    for (const c of fixture("graph").nodes) {
      const history = (
        await db.store.all("attempts", { conceptId: c.id })
      ).sort((a, b) => b.createdAt - a.createdAt);
      expect(readiness(history)).toBe(c.readiness);
      expect(history.every((a) => a.synthetic === true)).toBe(true);
    }
    const result = await request(ctx.app).post("/api/attempts").send({
      questionId: "q_backprop_1",
      conceptId: "c_backpropagation",
      correct: false,
    });
    expect(result.body).toEqual(fixture("attempt_response"));
  } finally {
    await db.client.close();
  }
});
it("supplies two distinct verified basic root questions from shared raw fixtures", async () => {
  const result = await request(ctx.app).post("/api/questions/next").send({
    moduleId: "m_backprop",
    conceptId: "c_chain_rule",
    difficulty: 1,
    n: 2,
  });
  expect(result.status).toBe(200);
  expect(result.body.questions).toHaveLength(2);
  expect(
    new Set(result.body.questions.map((q: any) => q.text.toLowerCase())).size,
  ).toBe(2);
  expect(
    result.body.questions.every((q: any) => q.difficulty === 1 && q.verified),
  ).toBe(true);
});
it("fresh in-module build reconstructs the fixture topology without seeding any graph rows", async () => {
  const db = await connect(mongo.getUri(), "fresh_build_acceptance");
  try {
    await seed(db.store);
    for (const name of ["concepts", "edges", "questions", "attempts"])
      await db.store.db.collection(name).deleteMany({});
    const ctx = createApp(db.store, new FakeAiClient());
    const result = await request(ctx.app).post("/api/modules/m_backprop/build");
    await ctx.jobs.drain();
    expect(await db.store.get("jobs", result.body.jobId)).toMatchObject({
      status: "done",
    });
    const graph = (await request(ctx.app).get("/api/graph")).body;
    const shape = (c: any) => {
      const { readiness, examWeight, ...rest } = c;
      return rest;
    };
    expect(graph.nodes.map(shape)).toEqual(fixture("graph").nodes.map(shape));
    expect(graph.edges).toEqual(fixture("graph").edges);
    expect(
      graph.nodes.every((c: any) => c.readiness === null && c.examWeight === 1),
    ).toBe(true);
    const again = await request(ctx.app).post("/api/modules/m_backprop/build");
    await ctx.jobs.drain();
    expect(await db.store.all("edges")).toHaveLength(2);
  } finally {
    await db.client.close();
  }
});
it("reports extraction failures without adding fields to shared Resource", async () => {
  const failed = createApp(connection.store, {
    call: async () => ({}),
    upload: async () => {
      throw new Error("Demo extraction failure");
    },
  });
  const result = await request(failed.app)
    .post("/api/resources/upload")
    .field("moduleId", "m_backprop")
    .field("tag", "notes")
    .attach("file", Buffer.from("%PDF-1.7 failed status demo"), "status.pdf");
  expect(result.status).toBe(201);
  expect(result.headers.location).toBe(
    `/api/resources/${result.body.id}/status`,
  );
  expect(sharedValidator("Resource")(result.body)).toBe(true);
  await failed.jobs.drain();
  const status = await request(failed.app).get(result.headers.location);
  expect(status.body).toEqual({
    status: "failed",
    error: "Demo extraction failure",
  });
  expect(sharedValidator("JobStatus")(status.body)).toBe(true);
});
it("allocates collision-safe IDs atomically without renaming fixture concepts", async () => {
  const { saveConcept, scopedConceptId } =
    await import("../src/services/identity.js");
  const original = await connection.store.get("concepts", "c_chain_rule");
  const copy = { ...original, moduleId: "m_other" };
  const ids = await Promise.all(
    Array.from({ length: 20 }, () =>
      saveConcept(connection.store, copy, { allowModuleSuffix: true }),
    ),
  );
  const a = ids[0];
  expect(ids.every((id) => id === a)).toBe(true);
  expect(a).toBe(scopedConceptId(original.id, "m_other"));
  expect(await connection.store.get("concepts", original.id)).toEqual(original);
  expect((await connection.store.get("concepts", a)).moduleId).toBe("m_other");
  await connection.store.db.collection("concepts").deleteOne({ id: a });
});
it("serves bundled OpenAPI with agreed shared schemas and every B endpoint", async () => {
  const result = await request(ctx.app).get("/api/openapi.json");
  expect(result.status).toBe(200);
  expect(result.body.openapi).toBe("3.1.0");
  expect(
    result.body.paths["/api/resources/{id}/status"].get.responses["200"],
  ).toBeDefined();
  expect(
    result.body.paths["/api/modules/{id}/build"].post.responses["202"],
  ).toBeDefined();
  expect(result.body.components.schemas.Trace.properties.evidence.$ref).toBe(
    "#/components/schemas/Evidence",
  );
  expect(result.body.components.schemas.B_ask.oneOf).toHaveLength(2);
});
it("concurrent attempts preserve the newest readiness without leaking sequence metadata", async () => {
  const c = await connection.store.get("concepts", "c_chain_rule");
  const result = await Promise.all([
    request(ctx.app)
      .post("/api/attempts")
      .send({ questionId: "q_chain_rule_1", conceptId: c.id, correct: true }),
    request(ctx.app)
      .post("/api/attempts")
      .send({ questionId: "q_chain_rule_1", conceptId: c.id, correct: false }),
  ]);
  expect(result.every((r) => r.status === 200)).toBe(true);
  const rows = (
    await connection.store.all("attempts", { conceptId: c.id })
  ).sort(
    (a, b) =>
      b.createdAt - a.createdAt || (b.sequence ?? 0) - (a.sequence ?? 0),
  );
  const { readiness } = await import("../src/services/learning.js");
  expect((await connection.store.get("concepts", c.id)).readiness).toBe(
    readiness(rows),
  );
  const graph = await request(ctx.app).get("/api/graph");
  expect(sharedValidator("Graph")(graph.body)).toBe(true);
});
it("concurrent acceptance of one flag records exactly one durable correction", async () => {
  const start = await request(ctx.app)
    .post("/api/lectures")
    .field("moduleId", "m_backprop")
    .field("slidesResourceId", "r1")
    .attach("audio", Buffer.from("race audio"), "race.wav");
  await ctx.jobs.drain();
  const id = start.body.lectureId;
  const lecture = await connection.store.get("lectures", id);
  const flag = lecture.flags[0];
  const responses = await Promise.all(
    [1, 2].map(() =>
      request(ctx.app)
        .post(`/api/lectures/${id}/corrections`)
        .send({ flagId: flag.id }),
    ),
  );
  expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
  expect(
    (await connection.store.get("lectures", id)).correctionEvents,
  ).toHaveLength(1);
});
it("does not serve persisted MCQs with invalid option counts even if citations verify", async () => {
  const good = fixture("questions").questions[0];
  await connection.store.put("questions", {
    ...good,
    id: "malformed_persisted_mcq",
    options: [],
  });
  const result = await request(ctx.app).post("/api/questions/next").send({
    moduleId: "m_backprop",
    conceptId: "c_chain_rule",
    kind: "mcq",
    n: 20,
  });
  expect(result.status).toBe(200);
  expect(
    result.body.questions.some((q: any) => q.id === "malformed_persisted_mcq"),
  ).toBe(false);
  await connection.store.db
    .collection("questions")
    .deleteOne({ id: "malformed_persisted_mcq" });
});
it("preserves legacy learned counts when migrating to the durable correction journal", async () => {
  const db = await connect(mongo.getUri(), "legacy_correction_acceptance");
  try {
    await seed(db.store);
    const sample = fixture("lecture");
    await db.store.put("lectures", {
      id: "legacy_lecture",
      moduleId: "m_backprop",
      status: "done",
      version: 0,
      ...sample,
    });
    await db.store.put("corrections", {
      id: "m_backprop:back propagation:backpropagation",
      moduleId: "m_backprop",
      from: "back propagation",
      to: "Backpropagation",
      count: 2,
    });
    const app = createApp(db.store, new FakeAiClient());
    const result = await request(app.app)
      .post("/api/lectures/legacy_lecture/corrections")
      .send({ flagId: "f1" });
    expect(result.status).toBe(200);
    const counter = (await db.store.all("corrections"))[0];
    expect(counter.count).toBe(3);
    expect(counter.legacyCount).toBe(2);
    const { correctionHistory } =
      await import("../src/services/correctionHistory.js");
    expect((await correctionHistory(db.store, "m_backprop"))[0].count).toBe(3);
  } finally {
    await db.client.close();
  }
});
