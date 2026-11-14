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
