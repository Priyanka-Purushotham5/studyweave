import { createHash } from "node:crypto";
import { ApiError } from "./errors.js";
import { Store } from "../db/store.js";
import type { Concept } from "../contracts/types.js";
/** Existing public IDs remain unchanged. Only collisions receive a stable suffix.
 * The shared schema accepts string IDs; no fixture or existing row is renamed.
 */
export function scopedConceptId(base: string, moduleId: string) {
  return `${base}__${createHash("sha256").update(moduleId).digest("hex").slice(0, 12)}`;
}
export async function saveConcept(
  s: Store,
  concept: Concept,
  options: { allowModuleSuffix?: boolean } = {},
) {
  const base = concept.id;
  let candidate = { ...concept };
  for (let attempt = 0; attempt < 4; attempt++) {
    const old = await s.get<Concept>("concepts", candidate.id);
    if (old && old.moduleId !== candidate.moduleId) {
      if (!options.allowModuleSuffix)
        throw new ApiError(
          "bad_request",
          "This concept name already belongs to another module; module suffixes require an agreed ID policy",
        );
      candidate.id = scopedConceptId(base, candidate.moduleId);
      continue;
    }
    try {
      await s.db.collection("concepts").updateOne(
        { id: candidate.id, moduleId: candidate.moduleId },
        {
          $set: {
            ...candidate,
            readiness: old?.readiness ?? candidate.readiness,
            examWeight: old?.examWeight ?? candidate.examWeight,
          },
        },
        { upsert: true },
      );
      return candidate.id;
    } catch (error: any) {
      if (error.code !== 11000) throw error;
      if (!options.allowModuleSuffix)
        throw new ApiError(
          "bad_request",
          "Concurrent concept ID collision; retry or review the module ID policy",
        );
      candidate.id = scopedConceptId(base, candidate.moduleId);
    }
  }
  throw new Error("Could not allocate a unique concept ID; retry the build");
}
