import { correctionHistory } from "./correctionHistory.js";
import { validateUploadSize } from "./uploads.js";
import { sanitizeText } from "./text.js";
import { plainPages } from "./public.js";
import { randomUUID } from "node:crypto";
import { Store } from "../db/store.js";
import type { AiClient } from "../ai/aiClient.js";
import { Jobs } from "./jobs.js";
import { ApiError, requireValue } from "./errors.js";
import { applyCorrection } from "./learning.js";
export class Lectures {
  constructor(
    private s: Store,
    private ai: AiClient,
    private jobs: Jobs,
  ) {}
  async create(
    moduleId: string,
    slidesResourceId: string,
    buffer: Buffer,
    filename: string,
  ) {
    validateUploadSize(buffer);
    requireValue<any>(
      await this.s.get<any>("modules", moduleId),
      "Module not found",
    );
    const slides = requireValue<any>(
      await this.s.get<any>("resources", slidesResourceId),
      "Slides not found",
    );
    if (slides.moduleId !== moduleId || slides.extractionStatus !== "done")
      throw new ApiError(
        "bad_request",
        "Slides must be extracted and belong to this module",
      );
    const id = randomUUID();
    const audioFileId = await this.s.saveFile(
      buffer,
      filename,
      "application/octet-stream",
    );
    const lecture = {
      audioFileId,
      audioUrl: `/api/lectures/${id}/audio`,
      id,
      moduleId,
      slidesResourceId,
      version: 0,
      status: "queued",
      words: [],
      flags: [],
      glossary: [],
    };
    await this.s.put("lectures", lecture);
    const jobId = await this.jobs.enqueue("lecture", async () => {
      await this.s.put("lectures", { ...lecture, status: "running" });
      try {
        const glossary = (
          await this.ai.call("/v1/glossary", {
            pages: plainPages(slides.pages),
          })
        ).terms.map((term: any) => ({
          ...term,
          term: sanitizeText(term.term),
          definition: sanitizeText(term.definition),
        }));
        const corrections = await correctionHistory(this.s, moduleId);
        const transcribed = await this.ai.upload(
          "/v1/transcribe",
          buffer,
          filename,
          {
            glossary: JSON.stringify(glossary),
            hints: JSON.stringify(
              corrections.filter((c) => c.count >= 2).map((c) => c.correct),
            ),
          },
        );
        transcribed.words = transcribed.words.map((word: any) => ({
          ...word,
          w: sanitizeText(word.w),
        }));
        const result = await this.ai.call("/v1/flag", {
          words: transcribed.words,
          glossary,
          corrections,
        });
        let fixed = { words: transcribed.words, flags: result.flags };
        for (const f of [...(result.autoFixed ?? [])].sort(
          (a, b) => b.startIdx - a.startIdx,
        ))
          fixed = applyCorrection(
            fixed.words,
            fixed.flags,
            f.startIdx,
            f.endIdx,
            f.to,
          );
        await this.s.put("lectures", {
          ...lecture,
          ...fixed,
          glossary,
          status: "done",
        });
      } catch (e) {
        await this.s.put("lectures", {
          ...lecture,
          status: "failed",
          error: e instanceof Error ? e.message : "Lecture processing failed",
        });
        throw e;
      }
    });
    return { lectureId: id, jobId };
  }
  async correct(id: string, b: any) {
    const l = requireValue<any>(
      await this.s.get<any>("lectures", id),
      "Lecture not found",
    );
    if (l.status !== "done")
      throw new ApiError("bad_request", "Lecture is not ready");
    const flag = b.flagId
      ? requireValue(
          l.flags.find((f: any) => f.id === b.flagId),
          "Flag not found",
        )
      : null;
    const start = flag?.startIdx ?? b.startIdx,
      end = flag?.endIdx ?? b.endIdx,
      to = sanitizeText(flag?.suggestion ?? b.to);
    let fixed;
    try {
      fixed = applyCorrection(l.words, l.flags, start, end, to);
    } catch {
      throw new ApiError("bad_request", "Invalid correction span");
    }
    const from = l.words
      .slice(start, end)
      .map((w: any) => w.w)
      .join(" ");
    await correctionHistory(this.s, l.moduleId); // migrate old counters before appending a journal event
    const version = l.version ?? 0;
    const accepted = await this.s.db.collection("lectures").updateOne(
      {
        id: l.id,
        $or: [
          { version },
          ...(version === 0 ? [{ version: { $exists: false } }] : []),
        ],
      },
      {
        $set: fixed,
        $inc: { version: 1 },
        $push: {
          correctionEvents: {
            id: randomUUID(),
            heard: from,
            correct: to,
            createdAt: Date.now(),
          },
        },
      } as any,
    );
    if (!accepted.matchedCount)
      throw new ApiError(
        "bad_request",
        "Lecture changed while applying this correction; reload and retry",
      );
    const history = await correctionHistory(this.s, l.moduleId);
    const entry = history.find(
      (h) =>
        h.heard.toLowerCase() === from.toLowerCase() &&
        h.correct.toLowerCase() === to.toLowerCase(),
    )!;
    await this.s.db.collection("corrections").updateOne(
      { id: `${l.moduleId}:${from.toLowerCase()}:${to.toLowerCase()}` },
      {
        $setOnInsert: { moduleId: l.moduleId, from, to, legacyCount: 0 },
        $max: { count: entry.count },
      },
      { upsert: true },
    );
    return fixed;
  }
}
