import { Store } from "../db/store.js";
/** Transcript and correction journal are one atomic document write. The learned
 * counter is a rebuildable projection, so a process crash cannot lose a lesson.
 */
export async function correctionHistory(s: Store, moduleId: string) {
  const map = new Map<
    string,
    { heard: string; correct: string; count: number }
  >();
  for (const lecture of await s.all("lectures", { moduleId }))
    for (const event of lecture.correctionEvents ?? []) {
      const key = JSON.stringify([
        event.heard.toLowerCase(),
        event.correct.toLowerCase(),
      ]);
      const entry = map.get(key) ?? {
        heard: event.heard,
        correct: event.correct,
        count: 0,
      };
      entry.count++;
      map.set(key, entry);
    }
  for (const old of await s.all("corrections", { moduleId })) {
    const key = JSON.stringify([old.from.toLowerCase(), old.to.toLowerCase()]);
    const current = map.get(key) ?? {
      heard: old.from,
      correct: old.to,
      count: 0,
    };
    const legacy = old.legacyCount ?? Math.max(0, old.count - current.count);
    if (old.legacyCount === undefined)
      await s.db
        .collection("corrections")
        .updateOne(
          { id: old.id, legacyCount: { $exists: false } },
          { $set: { legacyCount: legacy } },
        );
    map.set(key, { ...current, count: current.count + legacy });
  }
  return [...map.values()];
}
