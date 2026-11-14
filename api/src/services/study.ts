import { randomUUID } from "node:crypto";
import { Store } from "../db/store.js";
import type { AiClient } from "../ai/aiClient.js";
import type { Attempt, Concept, Edge, Question } from "../contracts/types.js";
import { ApiError, requireValue } from "./errors.js";
import {
  readiness,
  trace,
  selectQuestions,
  revisionPlan,
  revisionPath,
} from "./learning.js";
import { generate, modulePages } from "./pipeline.js";
import { verified } from "./citations.js";
export interface QuestionFilter {
  moduleId: string;
  conceptId?: string;
  difficulty?: number;
  kind?: string;
  n: number;
}
/** Orchestrates persistence and AI calls; routes only validate and translate HTTP. */
export class Study {
  constructor(
    private s: Store,
    private ai: AiClient,
  ) {}
  async graph(subjectId?: string) {
    let cs = await this.s.all<Concept>("concepts");
    if (subjectId) {
      const exams = await this.s.all("exams", { subjectId });
      const modules = await this.s.all("modules", {
        examId: { $in: exams.map((e) => e.id) },
      });
      cs = cs.filter((c) => modules.some((m) => m.id === c.moduleId));
    }
    return {
      nodes: cs.map(({ embedding, ...c }) => c),
      edges: (await this.s.all<Edge>("edges")).filter(
        (e) => cs.some((c) => c.id === e.from) && cs.some((c) => c.id === e.to),
      ),
    };
  }
  async next(filter: QuestionFilter) {
    requireValue(
      await this.s.get("modules", filter.moduleId),
      "Module not found",
    );
    const cs = await this.s.all<Concept>("concepts"),
      attempts = await this.s.all<Attempt>("attempts");
    if (
      filter.conceptId &&
      !cs.some(
        (c) => c.id === filter.conceptId && c.moduleId === filter.moduleId,
      )
    )
      throw new ApiError("not_found", "Concept not found in this module");
    const pages = await modulePages(this.s, filter.moduleId);
    const stored = async () =>
      (await this.s.all<Question>("questions")).filter(
        (q) =>
          q.citations?.length && q.citations.every((e) => verified(e, pages)),
      );
    let qs = selectQuestions(await stored(), cs, attempts, filter);
    // A down must not prevent already-stored questions from being served.
    if (qs.length < filter.n) {
      for (const c of cs
        .filter(
          (c) =>
            c.moduleId === filter.moduleId &&
            (!filter.conceptId || c.id === filter.conceptId),
        )
        .sort((a, b) => (a.readiness ?? 0) - (b.readiness ?? 0))) {
        try {
          await generate(
            this.s,
            this.ai,
            c,
            filter.kind ?? "conceptual",
            filter.n,
          );
        } catch (e) {
          if (!qs.length) throw e;
          break;
        }
        qs = selectQuestions(await stored(), cs, attempts, filter);
        if (qs.length >= filter.n) break;
      }
    }
    return { questions: qs };
  }
  async attempt(body: {
    questionId: string;
    conceptId: string;
    correct: boolean;
  }) {
    const q = requireValue(
      await this.s.get<Question>("questions", body.questionId),
      "Question not found",
    );
    const c = requireValue(
      await this.s.get<Concept>("concepts", body.conceptId),
      "Concept not found",
    );
    if (!q.verified || !q.conceptIds.includes(c.id))
      throw new ApiError("bad_request", "Question does not test this concept");
    const counter = await this.s.db
      .collection("counters")
      .findOneAndUpdate(
        { id: "attempts" },
        { $inc: { sequence: 1 } },
        { upsert: true, returnDocument: "after" },
      );
    await this.s.put("attempts", {
      id: randomUUID(),
      ...body,
      createdAt: Date.now(),
      sequence: counter!.sequence,
    });
    const attempts = (
      await this.s.all<Attempt & { sequence?: number }>("attempts")
    ).sort(
      (a, b) =>
        b.createdAt - a.createdAt || (b.sequence ?? 0) - (a.sequence ?? 0),
    );
    const value = readiness(attempts.filter((a) => a.conceptId === c.id));
    await this.s.db
      .collection("concepts")
      .updateOne({ id: c.id }, { $set: { readiness: value } });
    return {
      readiness: { [c.id]: value },
      trace: body.correct
        ? null
        : trace(
            c.id,
            await this.s.all("concepts"),
            await this.s.all("edges"),
            attempts,
          ),
      xp: body.correct ? 10 : 0,
    };
  }
  async ask(body: { moduleId: string; question?: string; kind?: string }) {
    if (!body.question && !body.kind)
      throw new ApiError("bad_request", "question or kind is required");
    requireValue(
      await this.s.get("modules", body.moduleId),
      "Module not found",
    );
    const pages = await modulePages(this.s, body.moduleId);
    const result = await this.ai.call("/v1/answer", {
      ...(body.kind ? { kind: body.kind } : { question: body.question }),
      pages,
    });
    return result.refused
      ? result
      : result.citations?.length &&
          result.citations.every((e: any) => verified(e, pages))
        ? result
        : { refused: true, reason: "not_in_materials" };
  }
  async plan(examId: unknown, budget: unknown) {
    const minutes = Number(budget);
    if (
      typeof examId !== "string" ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 1440
    )
      throw new ApiError(
        "bad_request",
        "Provide examId and minutesPerDay (1–1440)",
      );
    requireValue(await this.s.get("exams", examId), "Exam not found");
    const modules = await this.s.all("modules", { examId });
    return revisionPlan(
      (await this.s.all<Concept>("concepts")).filter((c) =>
        modules.some((m) => m.id === c.moduleId),
      ),
      minutes,
    );
  }
  async path(conceptId: unknown) {
    if (typeof conceptId !== "string")
      throw new ApiError("bad_request", "conceptId required");
    requireValue(await this.s.get("concepts", conceptId), "Concept not found");
    const concepts = await this.s.all<Concept>("concepts");
    return revisionPath(
      trace(
        conceptId,
        concepts,
        await this.s.all("edges"),
        await this.s.all("attempts"),
      ),
      concepts,
    );
  }
}
