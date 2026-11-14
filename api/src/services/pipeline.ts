import { saveConcept } from "./identity.js";
import { servableQuestion } from "./questions.js";
import { plainPages, publicConcept } from "./public.js";
import { Store } from "../db/store.js";
import { hash, type AiClient } from "../ai/aiClient.js";
import {
  candidatePairs,
  curriculumPairs,
  type NeighborFinder,
} from "./neighbors.js";
import { verified } from "./citations.js";
import { ApiError, requireValue } from "./errors.js";
import type { Concept, Page, Question } from "../contracts/types.js";
export async function modulePages(s: Store, id: string): Promise<Page[]> {
  return (
    await s.all("resources", { moduleId: id, extractionStatus: "done" })
  ).flatMap((r) => r.pages);
}
export async function build(
  s: Store,
  ai: AiClient,
  finder: NeighborFinder,
  moduleId: string,
) {
  requireValue(await s.get("modules", moduleId), "Module not found");
  const pages = await modulePages(s, moduleId);
  if (!pages.length)
    throw new ApiError(
      "bad_request",
      "Wait for resource extraction before building",
    );
  const result = await ai.call("/v1/concepts/extract", { moduleId, pages });
  if (!Array.isArray(result.concepts))
    throw new ApiError("ai_unavailable", "Invalid concept response");
  const existing = await s.all<Concept>("concepts", { moduleId });
  const cs: Concept[] = result.concepts
    .filter(
      (c: any) =>
        c.evidence?.length && c.evidence.every((e: any) => verified(e, pages)),
    )
    .map((c: any) => ({
      id:
        existing.find((x) => x.name.toLowerCase() === c.name.toLowerCase())
          ?.id ??
        "c_" +
          c.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, ""),
      moduleId,
      name: c.name,
      definition: c.definition,
      evidence: c.evidence,
      readiness: null,
      examWeight: 1,
    }));
  const vectors = await ai.call("/v1/embed", {
    texts: cs.map((c) => c.definition),
  });
  if (
    vectors.vectors?.length !== cs.length ||
    vectors.vectors.some(
      (v: any) =>
        v.length !== 768 ||
        v.some((x: any) => typeof x !== "number" || !Number.isFinite(x)),
    )
  )
    throw new ApiError("ai_unavailable", "Invalid embedding response");
  for (let i = 0; i < cs.length; i++) {
    cs[i].embedding = vectors.vectors[i];
    cs[i].id = await saveConcept(s, cs[i], {
      allowModuleSuffix: process.env.CONCEPT_ID_COLLISIONS === "suffix",
    });
  }
  const all = await s.all<Concept>("concepts");
  const pairs = [
    ...curriculumPairs(cs, pages),
    ...(await candidatePairs(all, finder)),
  ];
  const allPages = (
    await s.all("resources", { extractionStatus: "done" })
  ).flatMap((r) => r.pages);
  const response = await ai.call("/v1/edges/type", {
    pairs: pairs.map(({ a, b }) => ({
      a: publicConcept(a),
      b: publicConcept(b),
    })),
    pages: allPages,
  });
  for (let index = 0; index < (response.edges ?? []).length; index++) {
    const e = response.edges[index],
      pair = pairs[index];
    if (
      e &&
      pair &&
      ((e.from === pair.a.id && e.to === pair.b.id) ||
        (e.from === pair.b.id && e.to === pair.a.id)) &&
      ["prerequisite", "extends", "contrasts"].includes(e.type) &&
      all.some((c) => c.id === e.from) &&
      all.some((c) => c.id === e.to) &&
      verified(e.evidence?.from, allPages) &&
      verified(e.evidence?.to, allPages)
    ) {
      const existing = (
        await s.all("edges", { from: e.from, to: e.to, type: e.type })
      )[0];
      await s.put("edges", {
        ...e,
        id: existing?.id ?? `e_${e.from}__${e.to}`,
      });
    }
  }
  await weights(s, ai, moduleId);
}
export async function weights(s: Store, ai: AiClient, moduleId: string) {
  const cs = await s.all<Concept>("concepts", { moduleId });
  const papers = await s.all("resources", {
    moduleId,
    tag: { $in: ["past_paper", "model_paper"] },
    extractionStatus: "done",
  });
  const count = new Map<string, number>();
  for (const p of papers) {
    const result = await ai.call("/v1/papers/tag", {
      pages: plainPages(p.pages),
      concepts: cs.map((c) => c.name),
    });
    const names = new Set<string>(
      (result.questions ?? []).flatMap((q: any) => q.concepts),
    );
    for (const c of cs)
      if (names.has(c.name)) count.set(c.id, (count.get(c.id) ?? 0) + 1);
  }
  for (const c of cs)
    await s.put("concepts", {
      ...c,
      examWeight: papers.length ? (count.get(c.id) ?? 0) : 1,
    });
}
export async function generate(
  s: Store,
  ai: AiClient,
  c: Concept,
  kind: string,
  n: number,
) {
  const pages = await modulePages(s, c.moduleId);
  const result = await ai.call("/v1/questions/generate", {
    concept: publicConcept(c),
    pages,
    kind,
    n: Math.min(n, 20),
  });
  for (const q of result.questions ?? [])
    if (
      servableQuestion(q, pages) &&
      q.kind === kind &&
      q.verified === true &&
      q.conceptIds?.includes(c.id) &&
      [1, 2, 3].includes(q.difficulty) &&
      q.citations?.length &&
      q.citations.every((e: any) => verified(e, pages))
    ) {
      const existing = (await s.all<Question>("questions")).find(
        (x) =>
          x.kind === q.kind &&
          x.conceptIds.includes(c.id) &&
          x.text.trim().toLowerCase() === q.text.trim().toLowerCase(),
      );
      await s.put("questions", { ...q, id: existing?.id ?? q.id } as Question);
    }
}
