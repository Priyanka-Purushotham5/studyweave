import type { Attempt } from "../contracts/types.js";
import { Store } from "../db/store.js";
import { readiness } from "./learning.js";
/** Labelled synthetic histories that reproduce the agreed demo's rounded values.
 * These are demo seed data, never observations from a real learner.
 * Each array is newest-first, following the readiness contract.
 */
const histories: Record<string, boolean[]> = {
  c_gradient_descent: [true, true, true, true, false, false, true, true],
  c_chain_rule: [false, false, true, false, true, true, false],
  c_backpropagation: [false, false, true, true, true, true, false, true, true],
};
export async function seedDemoHistory(s: Store) {
  for (const [conceptId, corrects] of Object.entries(histories)) {
    const concept = await s.get("concepts", conceptId);
    if (!concept) continue;
    const prior = await s.all("attempts", { conceptId });
    if (prior.length) continue;
    if (
      readiness(corrects.map((correct) => ({ correct }))) !== concept.readiness
    )
      continue;
    const question = (await s.all("questions")).find((q) =>
      q.conceptIds.includes(conceptId),
    );
    if (!question) continue;
    for (let i = 0; i < corrects.length; i++) {
      const row: Attempt & { synthetic: boolean; source: string } = {
        id: `demo_history_${conceptId}_${i}`,
        questionId: question.id,
        conceptId,
        correct: corrects[i],
        createdAt: Date.UTC(2026, 0, 1) - i,
        synthetic: true,
        source: "synthetic_shared_demo_history",
      };
      await s.put("attempts", row);
    }
  }
}
