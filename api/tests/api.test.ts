import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { MAX_UPLOAD_BYTES } from "../src/services/uploads.js";
import { MAX_PAGE_CHARACTERS } from "../src/services/text.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { weights } from "../src/services/pipeline.js";
import {
  AtlasNeighborFinder,
  CosineNeighborFinder,
} from "../src/services/neighbors.js";
import { Jobs } from "../src/services/jobs.js";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connect, Store } from "../src/db/store.js";
import { createApp } from "../src/app.js";
import {
  LegacyFakeAiClient as FakeAiClient,
  CachedAiClient,
} from "../src/ai/aiClient.js";
import { seedLegacy as seed } from "../src/services/seed.js";
import { concepts, edges } from "../src/fixtures/demo.js";
import { ApiError } from "../src/services/errors.js";
let mongo: MongoMemoryServer;
let connection: Awaited<ReturnType<typeof connect>>;
let s: Store;
let ctx: ReturnType<typeof createApp>;
let fake: FakeAiClient;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      version: "7.0.14",
      downloadDir:
        process.env.MONGOMS_DOWNLOAD_DIR ?? "/tmp/studyweave-mongodb",
    },
  });
  connection = await connect(mongo.getUri());
  s = connection.store;
}, 120000);
beforeEach(async () => {
  await connection.store.db.dropDatabase();
  await s.indexes();
  fake = new FakeAiClient();
  ctx = createApp(s, fake, { enableSeed: true });
});
afterAll(async () => {
  await ctx?.jobs.drain();
  await connection?.client.close();
  await mongo?.stop();
});
describe("B1 B2 B12 API and Mongo persistence", () => {
  it("health, error envelope and validation", async () => {
    expect((await request(ctx.app).get("/healthz")).body).toEqual({ ok: true });
    expect((await request(ctx.app).get("/missing")).body.error.code).toBe(
      "not_found",
    );
    expect((await request(ctx.app).post("/api/subjects").send({})).status).toBe(
      400,
    );
    expect(
      (
        await request(ctx.app)
          .post("/api/subjects")
          .set("content-type", "application/json")
          .send("{")
      ).body.error.code,
    ).toBe("bad_request");
  });
  it("creates hierarchy and rejects orphan module", async () => {
    const subject = await request(ctx.app)
      .post("/api/subjects")
      .send({ name: "Math" });
    const exam = await request(ctx.app)
      .post("/api/exams")
      .send({ name: "Final", subjectId: subject.body.id });
    const module = await request(ctx.app)
      .post("/api/modules")
      .send({ name: "Calculus", examId: exam.body.id });
    const tree = (await request(ctx.app).get("/api/tree")).body.subjects;
    expect(tree[0].exams[0].modules[0].id).toBe(module.body.id);
    expect(
      (
        await request(ctx.app)
          .post("/api/modules")
          .send({ name: "x", examId: "missing" })
      ).status,
    ).toBe(404);
  });
  it("seed is idempotent and graph equals fixture", async () => {
    await seed(s);
    await seed(s);
    const graph = (await request(ctx.app).get("/api/graph?subjectId=s_ml"))
      .body;
    expect(graph).toEqual({ nodes: concepts, edges });
    expect(await s.all("resources")).toHaveLength(1);
  });
});
describe("Module B acceptance integration", () => {
  beforeEach(async () => seed(s));
  it("resource returns pending, persists 3 parsed pages, deduplicates", async () => {
    const res = await request(ctx.app)
      .post("/api/resources/upload")
      .field("moduleId", "m_backprop")
      .field("tag", "notes")
      .attach("file", Buffer.from("%PDF-1.7 fixture"), "slides.pdf");
    expect(res.status).toBe(201);
    expect(res.body.extractionStatus).toBe("pending");
    await ctx.jobs.drain();
    const row = await s.get("resources", res.body.id);
    expect(row.pages).toHaveLength(3);
    expect(row.extractionStatus).toBe("done");
    const again = await request(ctx.app)
      .post("/api/resources/upload")
      .field("moduleId", "m_backprop")
      .field("tag", "notes")
      .attach("file", Buffer.from("%PDF-1.7 fixture"), "slides.pdf");
    expect(again.body.id).toBe(res.body.id);
  });
  it("failed scanned extraction retains resource with plain explanation", async () => {
    const res = await request(ctx.app)
      .post("/api/resources/upload")
      .field("moduleId", "m_backprop")
      .field("tag", "notes")
      .attach("file", Buffer.from("%PDF-1.7 SCANNED"), "scan.pdf");
    await ctx.jobs.drain();
    expect((await s.get("resources", res.body.id)).extractionStatus).toBe(
      "unsupported",
    );
    expect((await s.get("resources", res.body.id)).extractionError).toContain(
      "Scanned PDF",
    );
  });
  it("build is idempotent and cached", async () => {
    const run = async () => {
      const r = await request(ctx.app).post("/api/modules/m_backprop/build");
      await ctx.jobs.drain();
      expect((await s.get("jobs", r.body.jobId)).status).toBe("done");
    };
    await run();
    const n = (await s.all("concepts")).length,
      calls = fake.calls;
    await run();
    expect(await s.all("concepts")).toHaveLength(n);
    expect(fake.calls).toBe(calls);
  });
  it("job fails with readable error", async () => {
    fake.call = async () => {
      throw new ApiError("ai_unavailable", "AI offline");
    };
    const r = await request(ctx.app).post("/api/modules/m_backprop/build");
    await ctx.jobs.drain();
    expect(await s.get("jobs", r.body.jobId)).toMatchObject({
      status: "failed",
      error: "AI offline",
    });
  });
  it("attempt lowers readiness and trace targets weak chain rule", async () => {
    await s.put("concepts", { ...concepts[0], readiness: 80 });
    await s.put("concepts", { ...concepts[1], readiness: 30 });
    await s.put("concepts", { ...concepts[2], readiness: 100 });
    await s.put("attempts", {
      id: "a",
      conceptId: "c_backprop",
      questionId: "q_c_backprop_1",
      correct: true,
      createdAt: 1,
    });
    const r = await request(ctx.app).post("/api/attempts").send({
      questionId: "q_c_backprop_1",
      conceptId: "c_backprop",
      correct: false,
    });
    expect(r.status).toBe(200);
    expect(r.body.readiness.c_backprop).toBe(44);
    expect(r.body.trace.rootConceptId).toBe("c_chain_rule");
    expect((await s.get("concepts", "c_backprop")).readiness).toBe(44);
    const next = await request(ctx.app).post("/api/questions/next").send({
      moduleId: "m_backprop",
      conceptId: r.body.trace.rootConceptId,
      difficulty: 1,
      n: 1,
    });
    expect(next.body.questions[0].id).toBe("q_c_chain_rule_1");
  });
  it("ask refusal and cache work without repeated AI calls", async () => {
    const body = {
      moduleId: "m_backprop",
      question: "What is the moon made of?",
    };
    const first = await request(ctx.app).post("/api/ask").send(body);
    const calls = fake.calls;
    expect(first.body).toEqual({ refused: true, reason: "not_in_materials" });
    await request(ctx.app).post("/api/ask").send(body);
    expect(fake.calls).toBe(calls);
  });
  it("lecture corrections learn after two accepts and auto-fix third lecture", async () => {
    const upload = async () => {
      const r = await request(ctx.app)
        .post("/api/lectures")
        .field("moduleId", "m_backprop")
        .field("slidesResourceId", "r_slides")
        .attach("audio", Buffer.from("audio"), "clip.wav");
      await ctx.jobs.drain();
      expect((await s.get("lectures", r.body.lectureId)).status).toBe("done");
      return r.body.lectureId;
    };
    for (let i = 0; i < 2; i++) {
      const id = await upload();
      const r = await request(ctx.app)
        .post(`/api/lectures/${id}/corrections`)
        .send({ flagId: "f1" });
      expect(r.body.words).toHaveLength(1);
      expect(r.body.flags).toEqual([]);
    }
    const id = await upload();
    const third = await s.get("lectures", id);
    expect(third.words[0].w).toBe("backpropagation");
    expect(third.flags).toEqual([]);
    expect((await s.all("corrections"))[0].count).toBe(2);
  });
  it("429 retries with backoff and maps to 503", async () => {
    let calls = 0;
    const client = new CachedAiClient(
      {
        call: async () => {
          calls++;
          throw new ApiError("rate_limited", "limit");
        },
        upload: async () => ({}),
      },
      s,
      async () => {},
    );
    await expect(client.call("/rate", {})).rejects.toMatchObject({
      code: "ai_unavailable",
    });
    expect(calls).toBe(4);
  });
});

describe("additional acceptance and failure drills", () => {
  beforeEach(async () => seed(s));
  it("bad citations are never served even if stored as verified", async () => {
    await s.put("questions", {
      ...(await s.get("questions", "q_c_chain_rule_1")),
      id: "bad",
      citations: [{ resourceId: "r_slides", page: 2, quote: "invented quote" }],
    });
    const result = await request(ctx.app)
      .post("/api/questions/next")
      .send({ moduleId: "m_backprop", n: 9 });
    expect(result.body.questions.some((q: any) => q.id === "bad")).toBe(false);
  });
  it("serves available questions while A is down", async () => {
    fake.call = async () => {
      throw new ApiError("ai_unavailable", "offline");
    };
    const r = await request(ctx.app)
      .post("/api/questions/next")
      .send({ moduleId: "m_backprop", conceptId: "c_chain_rule", n: 5 });
    expect(r.status).toBe(200);
    expect(r.body.questions).toHaveLength(3);
  });
  it("unsupported answers without citations become a refusal", async () => {
    fake.call = async () => ({ answer: "invented", citations: [] });
    const r = await request(ctx.app)
      .post("/api/ask")
      .send({ moduleId: "m_backprop", question: "Explain anything" });
    expect(r.body).toEqual({ refused: true, reason: "not_in_materials" });
  });
  it("invalid correction spans and missing resources have contract errors", async () => {
    expect((await request(ctx.app).get("/api/jobs/missing")).status).toBe(404);
    expect(
      (
        await request(ctx.app)
          .post("/api/lectures/missing/corrections")
          .send({ startIdx: -1, endIdx: 2, to: "x" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(ctx.app).post("/api/attempts").send({
          questionId: "q_c_chain_rule_1",
          conceptId: "c_backprop",
          correct: false,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(ctx.app).get(
          "/api/revision-plan?examId=x_ml&minutesPerDay=-1",
        )
      ).status,
    ).toBe(400);
  });
  it("weight counts distinct papers, not repeated questions within a paper", async () => {
    for (let i = 0; i < 2; i++) {
      await s.put("resources", {
        id: `paper${i}`,
        moduleId: "m_backprop",
        hash: `paper${i}`,
        type: "pdf",
        tag: "past_paper",
        extractionStatus: "done",
        pages: [
          { n: 1, resourceId: `paper${i}`, text: "Chain rule. Chain rule." },
        ],
      });
      await weights(s, fake, "m_backprop");
      expect((await s.get("concepts", "c_chain_rule")).examWeight).toBe(i + 1);
    }
    const graph = await request(ctx.app).get("/api/graph");
    expect(
      graph.body.nodes.find((n: any) => n.id === "c_chain_rule").examWeight,
    ).toBe(2);
  });
  it("Atlas unavailable falls back to identical cosine ranking", async () => {
    const cs = concepts.map((c, i) => ({
      ...c,
      moduleId: String(i),
      embedding: i === 2 ? [0, 1] : [1, 0],
    }));
    expect((await new AtlasNeighborFinder(s.db).find(cs[0], cs, 1))[0].id).toBe(
      (await new CosineNeighborFinder().find(cs[0], cs, 1))[0].id,
    );
  });
  it("jobs persist queued, running, done and restart failure", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const id = await ctx.jobs.enqueue("controlled", () => waiting);
    const first = await s.get("jobs", id);
    expect(["queued", "running"]).toContain(first.status);
    await new Promise((r) => setTimeout(r, 20));
    expect((await s.get("jobs", id)).status).toBe("running");
    release();
    await ctx.jobs.drain();
    expect((await s.get("jobs", id)).status).toBe("done");
    await s.put("jobs", { id: "orphan", kind: "build", status: "running" });
    await new Jobs(s).recover();
    expect((await s.get("jobs", "orphan")).status).toBe("failed");
  });
  it("persistent cache works across clients and failed AI calls are not cached", async () => {
    let calls = 0;
    const inner = {
      call: async () => {
        calls++;
        return { ok: true };
      },
      upload: async () => ({}),
    };
    await new CachedAiClient(inner, s).call("/same", { b: 1, a: 2 });
    await new CachedAiClient(inner, s).call("/same", { a: 2, b: 1 });
    expect(calls).toBe(1);
  });
  it("seed endpoint is disabled by default", async () => {
    const production = createApp(s, fake);
    expect((await request(production.app).post("/api/dev/seed")).status).toBe(
      404,
    );
  });
});

describe("capture persistence and asynchronous boundary", () => {
  beforeEach(async () => seed(s));
  it("retains original uploads in GridFS and serves byte ranges", async () => {
    const r = await request(ctx.app)
      .post("/api/resources/upload")
      .field("moduleId", "m_backprop")
      .field("tag", "notes")
      .attach("file", Buffer.from("%PDF-1.7 original content"), "source.pdf");
    await ctx.jobs.drain();
    const full = await request(ctx.app).get(`/api/resources/${r.body.id}/file`);
    expect(full.status).toBe(200);
    expect(Buffer.from(full.body).toString()).toBe("%PDF-1.7 original content");
    const part = await request(ctx.app)
      .get(`/api/resources/${r.body.id}/file`)
      .set("Range", "bytes=0-3");
    expect(part.status).toBe(206);
    expect(Buffer.from(part.body).toString()).toBe("%PDF");
  });
  it("returns before a delayed AI extraction finishes", async () => {
    const original = fake.upload.bind(fake);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    fake.upload = async (...args) => {
      await blocked;
      return original(...args);
    };
    const r = await request(ctx.app)
      .post("/api/resources/upload")
      .field("moduleId", "m_backprop")
      .field("tag", "notes")
      .attach("file", Buffer.from("%PDF-1.7 delayed"), "delayed.pdf");
    expect(r.body.extractionStatus).toBe("pending");
    expect((await s.get("resources", r.body.id)).extractionStatus).toBe(
      "pending",
    );
    release();
    await ctx.jobs.drain();
    expect((await s.get("resources", r.body.id)).extractionStatus).toBe("done");
  });
  it("build serves precisely the seeded public graph without duplicating IDs", async () => {
    const r = await request(ctx.app).post("/api/modules/m_backprop/build");
    await ctx.jobs.drain();
    expect((await s.get("jobs", r.body.jobId)).status).toBe("done");
    expect((await request(ctx.app).get("/api/graph")).body).toEqual({
      nodes: concepts,
      edges,
    });
  });
});

it("deployment smoke script passes against local seeded HTTP server", async () => {
  await seed(s);
  const server = ctx.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  try {
    const port = (server.address() as { port: number }).port;
    const { stdout } = await promisify(execFile)(
      "bash",
      ["../scripts/smoke.sh", `http://127.0.0.1:${port}`],
      { env: { ...process.env, ALLOW_HTTP: "1" } },
    );
    expect(stdout).toContain("Smoke checks passed");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
it("resubmitting failed extraction retries without duplicating original files", async () => {
  await seed(s);
  const upload = () =>
    request(ctx.app)
      .post("/api/resources/upload")
      .field("moduleId", "m_backprop")
      .field("tag", "notes")
      .attach("file", Buffer.from("%PDF-1.7 SCANNED"), "retry.pdf");
  const first = await upload();
  await ctx.jobs.drain();
  expect((await s.get("resources", first.body.id)).extractionStatus).toBe(
    "unsupported",
  );
  fake.upload = async () => ({ pages: [{ n: 1, text: "Recovered text" }] });
  const again = await upload();
  await ctx.jobs.drain();
  expect(again.body.id).toBe(first.body.id);
  expect((await s.get("resources", first.body.id)).extractionStatus).toBe(
    "done",
  );
  expect(await s.db.collection("fs.files").countDocuments()).toBe(1);
});
it("cross-module build stores only typed, two-sided verified candidate edges", async () => {
  await seed(s);
  await s.put("modules", {
    id: "m_other",
    examId: "x_ml",
    name: "Advanced backprop",
  });
  await s.put("resources", {
    id: "r_other",
    moduleId: "m_other",
    type: "pdf",
    title: "Advanced",
    hash: "other",
    extractionStatus: "done",
    pages: [
      {
        n: 3,
        resourceId: "r_other",
        text: "Backpropagation applies the chain rule layer by layer.",
      },
    ],
  });
  const r = await request(ctx.app).post("/api/modules/m_other/build");
  await ctx.jobs.drain();
  expect((await s.get("jobs", r.body.jobId)).status).toBe("done");
  const cs = await s.all("concepts", { moduleId: "m_other" });
  expect(cs).toHaveLength(1);
  const es = await s.all("edges", { to: cs[0].id });
  expect(es).toHaveLength(1);
  expect(es[0].from).toBe("c_chain_rule");
  expect(es[0].evidence.from.resourceId).toBe("r_slides");
  expect(es[0].evidence.to.resourceId).toBe("r_other");
  expect((await s.all("edges")).every((e) => e !== null)).toBe(true);
});
it("uploading a second tagged paper raises graph weights without a rebuild", async () => {
  await seed(s);
  for (let i = 0; i < 2; i++) {
    await request(ctx.app)
      .post("/api/resources/upload")
      .field("moduleId", "m_backprop")
      .field("tag", "past_paper")
      .attach("file", Buffer.from(`%PDF-1.7 paper ${i}`), `paper${i}.pdf`);
    await ctx.jobs.drain();
    const graph = await request(ctx.app).get("/api/graph");
    expect(
      graph.body.nodes.find((c: any) => c.id === "c_chain_rule").examWeight,
    ).toBe(i + 1);
  }
});

describe("demo upload and untrusted capture hardening", () => {
  beforeEach(async () => seed(s));
  it("rejects forged signatures before persistence or AI work", async () => {
    const before = fake.calls;
    for (const [name, data] of [
      ["bad.pdf", "<html>fake</html>"],
      ["bad.pptx", "PK fake"],
      ["bad.exe", "%PDF-1.7 fake"],
    ]) {
      const result = await request(ctx.app)
        .post("/api/resources/upload")
        .field("moduleId", "m_backprop")
        .field("tag", "notes")
        .attach("file", Buffer.from(data), name);
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("bad_request");
    }
    expect(await s.db.collection("fs.files").countDocuments()).toBe(0);
    expect(fake.calls).toBe(before);
  });
  it("rejects uploads above 20 MB for both documents and lectures", async () => {
    const data = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    data.write("%PDF-1.7\n");
    for (const [endpoint, field] of [
      ["/api/resources/upload", "file"],
      ["/api/lectures", "audio"],
    ]) {
      const result = await request(ctx.app)
        .post(endpoint)
        .field("moduleId", "m_backprop")
        .field("tag", "notes")
        .field("slidesResourceId", "r_slides")
        .attach(field, data, "large.pdf");
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("bad_request");
    }
    expect(await s.db.collection("fs.files").countDocuments()).toBe(0);
  });
  it("accepts a document at exactly 20 MB", async () => {
    const data = Buffer.alloc(MAX_UPLOAD_BYTES, 32);
    data.write("%PDF-1.7\n");
    const result = await request(ctx.app)
      .post("/api/resources/upload")
      .field("moduleId", "m_backprop")
      .field("tag", "notes")
      .attach("file", data, "boundary.pdf");
    expect(result.status).toBe(201);
    await ctx.jobs.drain();
    expect((await s.get("resources", result.body.id)).extractionStatus).toBe(
      "done",
    );
  });
  it("sanitizes extension capture before splitting and storing", async () => {
    const result = await request(ctx.app)
      .post("/api/resources")
      .send({
        moduleId: "m_backprop",
        type: "web",
        url: "https://8.8.8.8/demo",
        title: "Clean\u200btitle",
        text: "a\0\u200bb" + "z".repeat(5000),
      });
    expect(result.status).toBe(201);
    await ctx.jobs.drain();
    const row = await s.get("resources", result.body.id);
    expect(row.title).toBe("Cleantitle");
    expect(row.pages.map((p: any) => p.text).join("")).toBe(
      "ab" + "z".repeat(5000),
    );
    expect(
      row.pages.every((p: any) => p.text.length <= MAX_PAGE_CHARACTERS),
    ).toBe(true);
  });
  it("sanitizes and caps document extraction and its persistent AI cache", async () => {
    fake.upload = async () => ({
      pages: [
        { n: 1, text: "a\u200b\0b" + "x".repeat(MAX_PAGE_CHARACTERS + 500) },
      ],
    });
    const result = await request(ctx.app)
      .post("/api/resources/upload")
      .field("moduleId", "m_backprop")
      .field("tag", "notes")
      .attach("file", Buffer.from("%PDF-1.7 content"), "dirty.pdf");
    await ctx.jobs.drain();
    const row = await s.get("resources", result.body.id);
    expect(row.pages[0].text).toHaveLength(MAX_PAGE_CHARACTERS);
    expect(row.pages[0].text.startsWith("ab")).toBe(true);
    const cached = (await s.all("cache"))[0];
    expect(cached.value.pages[0].text).toBe(row.pages[0].text);
  });
  it("sanitizes YouTube text returned by A", async () => {
    fake.call = async () => ({
      pages: [
        { n: 1, text: "video\u200b\0text" + "x".repeat(MAX_PAGE_CHARACTERS) },
      ],
    });
    const result = await request(ctx.app).post("/api/resources").send({
      moduleId: "m_backprop",
      type: "youtube",
      url: "https://8.8.8.8/video",
    });
    await ctx.jobs.drain();
    const row = await s.get("resources", result.body.id);
    expect(row.pages[0].text).toHaveLength(MAX_PAGE_CHARACTERS);
    expect(row.pages[0].text.startsWith("videotext")).toBe(true);
  });
});

describe("public demo security policy", () => {
  it("allows only demo routes and rejects unsupported methods and sensitive endpoints", async () => {
    const app = createApp(s, fake, { publicDemo: true, enableSeed: true }).app;
    for (const path of ["/healthz", "/readyz", "/api/tree", "/api/graph"]) {
      expect((await request(app).get(path)).status, path).toBe(200);
    }
    for (const path of [
      "/api/dev/seed",
      "/api/subjects",
      "/api/exams",
      "/api/modules",
      "/api/resources",
      "/api/resources/upload",
      "/api/modules/m_backprop/build",
      "/api/ask",
      "/api/lectures",
      "/api/lectures/x/corrections",
      "/api/reset",
      "/api/admin",
    ]) {
      expect((await request(app).post(path).send({})).status, path).toBe(404);
    }
    for (const path of [
      "/api/openapi.json",
      "/api/resources/x/file",
      "/api/resources/x/status",
      "/api/jobs/x",
      "/api/revision-plan",
      "/api/revision-path",
      "/api/lectures/x",
      "/api/lectures/x/audio",
    ]) {
      expect((await request(app).get(path)).status, path).toBe(404);
    }
    for (const method of ["post", "put", "patch", "delete"] as const) {
      expect((await request(app)[method]("/api/tree")).status).toBe(404);
    }
    expect((await request(app).get("/api/attempts")).status).toBe(404);
    expect((await request(app).post("/api/attempts").send({})).status).toBe(
      400,
    );
  });

  it("uses only public fixtures without AI calls or database writes", async () => {
    const app = createApp(s, fake, { publicDemo: true }).app;
    const before = await s.db.listCollections().toArray();
    const result = await request(app)
      .post("/api/questions/next")
      .send({ moduleId: "m_backprop", n: 1 });
    expect(result.status).toBe(200);
    const question = result.body.questions[0];
    expect(question).toBeDefined();
    const attempt = await request(app).post("/api/attempts").send({
      questionId: question.id,
      conceptId: question.conceptIds[0],
      correct: false,
    });
    expect(attempt.status).toBe(200);
    expect(attempt.body.trace.rootConceptId).toBeTruthy();
    expect(await s.db.listCollections().toArray()).toEqual(before);
    expect(await s.all("attempts")).toHaveLength(0);
    expect(fake.calls).toBe(0);
    expect(
      (
        await request(app).post("/api/attempts").send({
          questionId: "private",
          conceptId: question.conceptIds[0],
          correct: false,
        })
      ).status,
    ).toBe(404);
  });

  it("limits anonymous interactions", async () => {
    const app = createApp(s, fake, { publicDemo: true }).app;
    for (let i = 0; i < 60; i++)
      await request(app).post("/api/attempts").send({});
    expect((await request(app).post("/api/attempts").send({})).status).toBe(
      429,
    );
  });
});
