import type {
  Attempt,
  Concept,
  Edge,
  Trace,
  Question,
  Word,
  Flag,
} from "../contracts/types.js";
export function readiness(attempts: Pick<Attempt, "correct">[]): number | null {
  if (!attempts.length) return null;
  let sum = 0,
    total = 0;
  attempts.forEach((a, k) => {
    const w = 0.8 ** k;
    sum += w * Number(a.correct);
    total += w;
  });
  return Math.round((100 * sum) / total);
}
export function trace(
  id: string,
  concepts: Concept[],
  edges: Edge[],
  attempts: Attempt[],
): Trace {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const seen = new Set([id]);
  const queue = [{ id, path: [id] }];
  const candidates: { id: string; path: string[] }[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges.filter(
      (e) => e.type === "prerequisite" && e.to === cur.id,
    )) {
      if (seen.has(e.from) || !byId.has(e.from)) continue;
      seen.add(e.from);
      const next = { id: e.from, path: [e.from, ...cur.path] };
      candidates.push(next);
      queue.push(next);
    }
  }
  const weak = candidates
    .filter((c) => (byId.get(c.id)?.readiness ?? 0) < 70)
    .sort(
      (a, b) =>
        (byId.get(a.id)?.readiness ?? 0) - (byId.get(b.id)?.readiness ?? 0) ||
        a.path.length - b.path.length ||
        a.id.localeCompare(b.id),
    );
  const root = weak[0] ?? { id, path: [id] };
  const c = byId.get(root.id);
  return {
    rootConceptId: root.id,
    path: root.path,
    readiness: c?.readiness ?? null,
    evidence: c?.evidence ?? [],
    status:
      attempts.filter((a) => a.conceptId === root.id).length >= 2 &&
      (c?.readiness ?? 100) < 40
        ? "likely"
        : "possible",
  };
}
export function selectQuestions(
  qs: Question[],
  cs: Concept[],
  attempts: Attempt[],
  filter: {
    moduleId: string;
    conceptId?: string;
    difficulty?: number;
    kind?: string;
    n: number;
  },
) {
  const allowed = cs.filter(
    (c) =>
      c.moduleId === filter.moduleId &&
      (!filter.conceptId || c.id === filter.conceptId),
  );
  const ranked = allowed.sort(
    (a, b) =>
      (a.readiness ?? 0) - (b.readiness ?? 0) ||
      Math.max(
        0,
        ...attempts
          .filter((x) => x.conceptId === b.id && !x.correct)
          .map((x) => x.createdAt),
      ) -
        Math.max(
          0,
          ...attempts
            .filter((x) => x.conceptId === a.id && !x.correct)
            .map((x) => x.createdAt),
        ) ||
      a.id.localeCompare(b.id),
  );
  return qs
    .filter(
      (q) =>
        q.verified &&
        q.citations.length &&
        q.conceptIds.some((id) => ranked.some((c) => c.id === id)) &&
        (!filter.kind || q.kind === filter.kind) &&
        (!filter.difficulty || q.difficulty === filter.difficulty),
    )
    .sort(
      (a, b) =>
        Math.min(
          ...a.conceptIds
            .map((id) => ranked.findIndex((c) => c.id === id))
            .filter((i) => i >= 0),
        ) -
          Math.min(
            ...b.conceptIds
              .map((id) => ranked.findIndex((c) => c.id === id))
              .filter((i) => i >= 0),
          ) || a.id.localeCompare(b.id),
    )
    .slice(0, filter.n);
}
export function revisionPlan(cs: Concept[], budget: number) {
  const ranked = cs
    .map((c) => ({
      conceptId: c.id,
      name: c.name,
      priority: c.examWeight * (100 - (c.readiness ?? 0)),
      minutes: 5,
    }))
    .filter((c) => c.priority > 0)
    .sort(
      (a, b) =>
        b.priority - a.priority || a.conceptId.localeCompare(b.conceptId),
    )
    .slice(0, Math.floor(budget / 5));
  let left = budget - ranked.length * 5;
  const total = ranked.reduce((s, c) => s + c.priority, 0);
  for (const c of ranked) {
    const extra = Math.floor(
      ((budget - ranked.length * 5) * c.priority) / total,
    );
    c.minutes += extra;
    left -= extra;
  }
  for (let i = 0; left > 0 && ranked.length; i++, left--)
    ranked[i % ranked.length].minutes++;
  return ranked;
}
export function revisionPath(t: Trace, concepts: Concept[] = []) {
  if (t.path.length === 1) return [{ kind: "retry", conceptId: t.path[0] }];
  return [
    { kind: "review", conceptId: t.rootConceptId, evidence: t.evidence },
    { kind: "practice", conceptId: t.rootConceptId, difficulty: 1, n: 2 },
    ...t.path.slice(1, -1).map((conceptId) => ({
      kind: "review",
      conceptId,
      evidence: concepts.find((c) => c.id === conceptId)?.evidence ?? [],
    })),
    { kind: "retry", conceptId: t.path.at(-1) },
  ];
}
export function applyCorrection(
  words: Word[],
  flags: Flag[],
  start: number,
  end: number,
  to: string,
) {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > words.length ||
    start >= end ||
    !to.trim()
  )
    throw new Error("Invalid correction span");
  const replacements = to.trim().split(/\s+/);
  const from = words[start].startSec,
    until = words[end - 1].endSec;
  const added = replacements.map((w, i) => ({
    w,
    startSec: from + ((until - from) * i) / replacements.length,
    endSec: from + ((until - from) * (i + 1)) / replacements.length,
  }));
  const shift = added.length - (end - start);
  return {
    words: [...words.slice(0, start), ...added, ...words.slice(end)],
    flags: flags
      .filter((f) => f.endIdx <= start || f.startIdx >= end)
      .map((f) =>
        f.startIdx >= end
          ? { ...f, startIdx: f.startIdx + shift, endIdx: f.endIdx + shift }
          : f,
      ),
  };
}
