import type { Concept, Edge, Question, Page } from "../contracts/types.js";
export const pages: Page[] = [
  {
    resourceId: "r_slides",
    n: 1,
    text: "Gradient descent minimizes a loss function.",
  },
  {
    resourceId: "r_slides",
    n: 2,
    text: "The chain rule differentiates composite functions.",
  },
  {
    resourceId: "r_slides",
    n: 3,
    text: "Backpropagation applies the chain rule layer by layer.",
  },
];
export const concepts: Concept[] = [
  "Gradient descent",
  "Chain rule",
  "Backpropagation",
].map((name, i) => ({
  id: ["c_gradient", "c_chain_rule", "c_backprop"][i],
  moduleId: "m_backprop",
  name,
  definition: pages[i].text,
  evidence: [{ resourceId: "r_slides", page: i + 1, quote: pages[i].text }],
  examWeight: 1,
  readiness: null,
}));
export const edges: Edge[] = [
  {
    id: "e1",
    from: "c_gradient",
    to: "c_chain_rule",
    type: "prerequisite",
    reason: "Differentiation supports optimization.",
    evidence: { from: concepts[0].evidence[0], to: concepts[1].evidence[0] },
  },
  {
    id: "e2",
    from: "c_chain_rule",
    to: "c_backprop",
    type: "prerequisite",
    reason: "Backpropagation applies the chain rule.",
    evidence: { from: concepts[1].evidence[0], to: concepts[2].evidence[0] },
  },
];
export const questions: Question[] = concepts.flatMap((c) =>
  [1, 2, 3].map((d) => ({
    id: `q_${c.id}_${d}`,
    conceptIds: [c.id],
    kind: "conceptual" as const,
    options: [],
    difficulty: d,
    text: `Explain ${c.name}.`,
    answer: c.definition,
    citations: c.evidence,
    verified: true,
  })),
);
