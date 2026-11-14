import { it, expect } from "vitest";
import { responseValidators } from "../src/contracts/validation.js";
import { concepts, edges, questions, pages } from "../src/fixtures/demo.js";
import { verified } from "../src/services/citations.js";
it("all Module B demo fixtures satisfy the proposed contracts and citations", () => {
  expect(responseValidators.graph({ nodes: concepts, edges })).toBe(true);
  expect(responseValidators.questions({ questions })).toBe(true);
  expect(
    questions.every((q) => q.citations.every((e) => verified(e, pages))),
  ).toBe(true);
  expect(
    edges.every(
      (e) => verified(e.evidence.from, pages) && verified(e.evidence.to, pages),
    ),
  ).toBe(true);
});
it("question contract rejects unverified and invalid difficulty", () => {
  expect(
    responseValidators.questions({
      questions: [{ ...questions[0], verified: false }],
    }),
  ).toBe(false);
  expect(
    responseValidators.questions({
      questions: [{ ...questions[0], difficulty: 4 }],
    }),
  ).toBe(false);
});
