import { concepts, edges } from "./fixtures/demo.js";
import { trace } from "./services/learning.js";
// Twenty deterministic, labelled synthetic cases; this is not a live student study.
const cases = Array.from({ length: 20 }, (_, i) => {
  const mode = i % 4;
  const levels =
    mode === 0
      ? [80, 20, 50]
      : mode === 1
        ? [10, 50, 60]
        : mode === 2
          ? [30, 30, 40]
          : [80, 90, 40];
  const expected = ["c_chain_rule", "c_gradient", "c_chain_rule", "c_backprop"][
    mode
  ];
  const nodes = concepts.map((c, j) => ({
    ...c,
    readiness: levels[j] + (mode === 2 ? 0 : Math.floor(i / 4)),
  }));
  return {
    id: i + 1,
    expected,
    actual: trace("c_backprop", nodes, edges, []).rootConceptId,
  };
});
const hits = cases.filter((c) => c.expected === c.actual).length;
console.log(
  JSON.stringify(
    {
      dataset: "20 labelled synthetic fixture cases",
      hits,
      total: cases.length,
      hitRate: hits / cases.length,
      cases,
    },
    null,
    2,
  ),
);
if (hits !== cases.length) process.exitCode = 1;
