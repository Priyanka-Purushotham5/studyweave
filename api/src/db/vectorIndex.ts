export interface SearchIndexCollection {
  listSearchIndexes(name: string): { toArray(): Promise<any[]> };
  createSearchIndex(spec: any): Promise<string>;
}
export async function ensureVectorIndex(
  collection: SearchIndexCollection,
  spec: any,
  options: {
    timeoutMs?: number;
    pollMs?: number;
    wait?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
) {
  const existing = await collection.listSearchIndexes(spec.name).toArray();
  if (
    existing.length &&
    JSON.stringify(
      existing[0].latestDefinition ?? existing[0].definition ?? spec.definition,
    ) !== JSON.stringify(spec.definition)
  ) {
    // MongoDB can reorder keys in its response; compare a canonical representation.
    const canonical = (x: any): string =>
      JSON.stringify(x, (_, v) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(
              Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
            )
          : v,
      );
    if (
      canonical(existing[0].latestDefinition ?? existing[0].definition) !==
      canonical(spec.definition)
    )
      throw new Error(
        "Existing vector index has a different definition; review it before changing it",
      );
  }
  const created = !existing.length;
  if (created) await collection.createSearchIndex(spec);
  const now = options.now ?? Date.now,
    wait = options.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    deadline = now() + (options.timeoutMs ?? 120000);
  while (true) {
    const indexes = await collection.listSearchIndexes(spec.name).toArray();
    const index = indexes[0];
    if (index?.queryable === true)
      return { name: spec.name, created, status: "ready" as const };
    if (index?.status === "FAILED")
      throw new Error(
        "Atlas vector index failed to build; use VECTOR_MODE=cosine until the index is repaired",
      );
    if (now() >= deadline)
      throw new Error(
        "Atlas vector index is not ready before the deadline; continue with VECTOR_MODE=cosine",
      );
    await wait(options.pollMs ?? 2000);
  }
}
