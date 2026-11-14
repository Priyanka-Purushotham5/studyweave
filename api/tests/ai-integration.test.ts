import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { readFileSync } from "node:fs";
import { connect } from "../src/db/store.js";
import { seed } from "../src/services/seed.js";
import { HttpAiClient } from "../src/ai/aiClient.js";
import { createApp } from "../src/app.js";
import { fixture } from "../src/services/sharedFixtures.js";
import { sharedValidator } from "../src/contracts/shared.js";
const url = process.env.AI_INTEGRATION_URL;
describe.skipIf(!url)(
  "merged Module A HTTP integration (FAKE_GEMINI=1)",
  () => {
    let mongo: MongoMemoryServer,
      connection: Awaited<ReturnType<typeof connect>>,
      ctx: ReturnType<typeof createApp>;
    beforeAll(async () => {
      mongo = await MongoMemoryServer.create({
        binary: {
          version: "7.0.14",
          downloadDir:
            process.env.MONGOMS_DOWNLOAD_DIR ?? "/tmp/studyweave-mongodb",
        },
      });
      connection = await connect(mongo.getUri());
      await seed(connection.store);
      ctx = createApp(connection.store, new HttpAiClient(url!));
    }, 120000);
    afterAll(async () => {
      await ctx?.jobs.drain();
      await connection?.client.close();
      await mongo?.stop();
    });
    it("uploads the real PDF and builds concepts through the running A service", async () => {
      const file = readFileSync(
        new URL("../../fixtures/files/sample.pdf", import.meta.url),
      );
      const res = await request(ctx.app)
        .post("/api/resources/upload")
        .field("moduleId", "m_backprop")
        .field("tag", "notes")
        .attach("file", file, "sample.pdf");
      expect(res.status).toBe(201);
      await ctx.jobs.drain();
      expect(
        (await connection.store.get("resources", res.body.id)).pages,
      ).toHaveLength(3);
      const b = await request(ctx.app).post("/api/modules/m_backprop/build");
      await ctx.jobs.drain();
      expect(await connection.store.get("jobs", b.body.jobId)).toMatchObject({
        status: "done",
      });
      const graph = await request(ctx.app).get("/api/graph");
      expect(sharedValidator("Graph")(graph.body)).toBe(true);
      expect(graph.body.nodes).toHaveLength(4);
    });
    it("fresh build through actual A reconstructs canonical topology and provides two basic questions", async () => {
      const db = await connect(mongo.getUri(), "real_a_fresh_build");
      try {
        await seed(db.store);
        for (const name of ["concepts", "edges", "questions", "attempts"])
          await db.store.db.collection(name).deleteMany({});
        const fresh = createApp(db.store, new HttpAiClient(url!));
        const b = await request(fresh.app).post(
          "/api/modules/m_backprop/build",
        );
        await fresh.jobs.drain();
        expect(await db.store.get("jobs", b.body.jobId)).toMatchObject({
          status: "done",
        });
        const graph = (await request(fresh.app).get("/api/graph")).body;
        const shape = (c: any) => {
          const { readiness, examWeight, ...rest } = c;
          return rest;
        };
        expect(graph.nodes.map(shape)).toEqual(
          fixture("graph").nodes.map(shape),
        );
        expect(graph.edges).toEqual(fixture("graph").edges);
        expect(graph.nodes.every((c: any) => c.readiness === null)).toBe(true);
        const questions = await request(fresh.app)
          .post("/api/questions/next")
          .send({
            moduleId: "m_backprop",
            conceptId: "c_chain_rule",
            kind: "mcq",
            difficulty: 1,
            n: 2,
          });
        expect(questions.status).toBe(200);
        expect(questions.body.questions).toHaveLength(2);
        expect(
          new Set(questions.body.questions.map((q: any) => q.text)).size,
        ).toBe(2);
        expect(
          questions.body.questions.every(
            (q: any) => q.difficulty === 1 && q.verified,
          ),
        ).toBe(true);
      } finally {
        await db.client.close();
      }
    });
    it("runs the actual lecture correction loop and teaches A after two accepts", async () => {
      for (let i = 0; i < 3; i++) {
        const response = await request(ctx.app)
          .post("/api/lectures")
          .field("moduleId", "m_backprop")
          .field("slidesResourceId", "r1")
          .attach("audio", Buffer.from("fixture-audio"), "clip.wav");
        expect(response.status).toBe(202);
        await ctx.jobs.drain();
        const l = await request(ctx.app).get(
          "/api/lectures/" + response.body.lectureId,
        );
        expect(l.body.status).toBe("done");
        expect(sharedValidator("Lecture")(l.body)).toBe(true);
        if (i < 2) {
          const f = l.body.flags.find(
            (f: any) => f.heard === "back propagation",
          );
          expect(f).toBeDefined();
          const fix = await request(ctx.app)
            .post(`/api/lectures/${response.body.lectureId}/corrections`)
            .send({ flagId: f.id });
          expect(fix.status).toBe(200);
          expect(
            fix.body.words.some((w: any) => w.w === "Backpropagation"),
          ).toBe(true);
        } else {
          expect(l.body.words.some((w: any) => w.w === "Backpropagation")).toBe(
            true,
          );
          expect(
            l.body.flags.some((f: any) => f.heard === "back propagation"),
          ).toBe(false);
        }
      }
    }, 20000);
    it("preserves refusal when fixture citations are absent from module pages", async () => {
      await connection.store.put("modules", {
        id: "m_planets",
        examId: "e_midterm",
        name: "Planets",
      });
      await connection.store.put("resources", {
        id: "r_planets",
        moduleId: "m_planets",
        type: "web",
        title: "Planets",
        hash: "planets",
        extractionStatus: "done",
        pages: [{ resourceId: "r_planets", n: 1, text: "Mars is a planet." }],
      });
      const r = await request(ctx.app).post("/api/ask").send({
        moduleId: "m_planets",
        question: "What is the capital of Mars?",
      });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ refused: true, reason: "not_in_materials" });
    });
  },
);
