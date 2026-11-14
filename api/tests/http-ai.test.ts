import { afterEach, describe, it, expect } from "vitest";
import express from "express";
import multer from "multer";
import type { Server } from "node:http";
import { HttpAiClient } from "../src/ai/aiClient.js";
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (s) =>
          new Promise<void>((resolve, reject) =>
            s.close((e) => (e ? reject(e) : resolve())),
          ),
      ),
  );
});
async function serve(app: express.Express) {
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}
describe("Module A HTTP contract adapter", () => {
  it("passes JSON and multipart audio with glossary and hints through HTTP", async () => {
    const app = express();
    app.use(express.json());
    app.post("/v1/embed", (req, res) =>
      res.json({ vectors: req.body.texts.map(() => [1]) }),
    );
    app.post("/v1/transcribe", multer().single("file"), (req, res) => {
      expect(req.file?.originalname).toBe("clip.wav");
      expect(JSON.parse(req.body.glossary)).toEqual(["chain rule"]);
      expect(JSON.parse(req.body.hints)).toEqual(["backpropagation"]);
      res.json({ words: [], text: "" });
    });
    const ai = new HttpAiClient(await serve(app));
    expect(await ai.call("/v1/embed", { texts: ["x"] })).toEqual({
      vectors: [[1]],
    });
    expect(
      await ai.upload("/v1/transcribe", Buffer.from("audio"), "clip.wav", {
        glossary: '["chain rule"]',
        hints: '["backpropagation"]',
      }),
    ).toEqual({ words: [], text: "" });
  });
  it.each([
    [429, "rate_limited"],
    [503, "ai_unavailable"],
    [422, "bad_request"],
  ])("maps upstream %s", async (status, code) => {
    const app = express();
    app.post("/v1/test", (_req, res) =>
      res
        .status(status as number)
        .json({ error: { code, message: "upstream message" } }),
    );
    await expect(
      new HttpAiClient(await serve(app)).call("/v1/test", {}),
    ).rejects.toMatchObject({ code, message: "upstream message" });
  });
  it("invalid JSON is a readable service failure", async () => {
    const app = express();
    app.post("/v1/test", (_req, res) => res.send("not JSON"));
    await expect(
      new HttpAiClient(await serve(app)).call("/v1/test", {}),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
  });
  it("network failures map to service unavailable", async () => {
    const app = express();
    const url = await serve(app);
    await new Promise<void>((r) => servers.pop()!.close(() => r()));
    await expect(
      new HttpAiClient(url, 100).call("/v1/test", {}),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
  });
});
