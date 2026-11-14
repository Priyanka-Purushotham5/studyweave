import type { Concept } from "../contracts/types.js";
import type { Db } from "mongodb";
export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return norm ? a.reduce((s, x, i) => s + x * b[i], 0) / norm : 0;
}
export interface NeighborFinder {
  find(c: Concept, all: Concept[], k: number): Promise<Concept[]>;
}
export class CosineNeighborFinder implements NeighborFinder {
  async find(c: Concept, all: Concept[], k: number) {
    return all
      .filter((x) => x.id !== c.id && x.moduleId !== c.moduleId)
      .sort(
        (a, b) =>
          cosine(c.embedding ?? [], b.embedding ?? []) -
            cosine(c.embedding ?? [], a.embedding ?? []) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, k);
  }
}
export class AtlasNeighborFinder implements NeighborFinder {
  constructor(
    private db: Db,
    private fallback: NeighborFinder = new CosineNeighborFinder(),
  ) {}
  async find(c: Concept, all: Concept[], k: number) {
    try {
      const results = await this.db
        .collection<Concept>("concepts")
        .aggregate<Concept>([
          {
            $vectorSearch: {
              index: "concept_embedding",
              path: "embedding",
              queryVector: c.embedding,
              numCandidates: Math.max(k * 20, 100),
              limit: k,
              filter: { moduleId: { $ne: c.moduleId } },
            },
          },
          { $project: { _id: 0 } },
        ])
        .toArray();
      return results.length ? results : this.fallback.find(c, all, k);
    } catch {
      return this.fallback.find(c, all, k);
    }
  }
}
export async function candidatePairs(
  cs: Concept[],
  finder: NeighborFinder,
  k = 5,
) {
  const pairs: { a: Concept; b: Concept }[] = [];
  const seen = new Set<string>();
  for (const a of cs)
    for (const b of await finder.find(a, cs, k)) {
      const key = [a.id, b.id].sort().join(":");
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ a, b });
      }
    }
  return pairs;
}

/**
 * NeighborFinder remains cross-module (B4). Curriculum relations within a module
 * are a separate phase: source-order pairs, prioritizing explicit references in
 * a dependent's definition or evidence page. No relation is asserted without A.
 */
export function curriculumPairs(
  concepts: Concept[],
  pages: import("../contracts/types.js").Page[],
  k = 5,
) {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const ordered = [...concepts].sort(
    (a, b) =>
      (a.evidence[0]?.page ?? 0) - (b.evidence[0]?.page ?? 0) ||
      a.id.localeCompare(b.id),
  );
  const pairs: { a: Concept; b: Concept; reference: number }[] = [];
  for (let i = 0; i < ordered.length; i++)
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i],
        b = ordered[j];
      if (a.moduleId !== b.moduleId) continue;
      const context = [
        b.definition,
        ...pages
          .filter((p) =>
            b.evidence.some(
              (e) => e.resourceId === p.resourceId && e.page === p.n,
            ),
          )
          .map((p) => p.text),
      ].join(" ");
      const forward =
        (a.evidence[0]?.page ?? 0) < (b.evidence[0]?.page ?? 0) &&
        normalize(context).includes(normalize(a.name));
      pairs.push({ a, b, reference: Number(forward) });
    }
  const ranked = pairs.sort(
    (x, y) =>
      y.reference - x.reference ||
      (y.b.evidence[0]?.page ?? 0) - (x.b.evidence[0]?.page ?? 0) ||
      (y.a.evidence[0]?.page ?? 0) - (x.a.evidence[0]?.page ?? 0) ||
      x.a.id.localeCompare(y.a.id) ||
      x.b.id.localeCompare(y.b.id),
  );
  const counts = new Map<string, number>();
  return ranked
    .filter(({ a, b }) => {
      if ((counts.get(a.id) ?? 0) >= k || (counts.get(b.id) ?? 0) >= k)
        return false;
      counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
      counts.set(b.id, (counts.get(b.id) ?? 0) + 1);
      return true;
    })
    .map(({ a, b }) => ({ a, b }));
}
