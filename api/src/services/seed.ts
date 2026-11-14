import { Store } from "../db/store.js";
import { concepts, edges, questions, pages } from "../fixtures/demo.js";
export async function seed(s: Store) {
  for (const [n, rows] of Object.entries({
    subjects: [{ id: "s_ml", name: "Machine Learning" }],
    exams: [{ id: "x_ml", subjectId: "s_ml", name: "Final" }],
    modules: [{ id: "m_backprop", examId: "x_ml", name: "Backpropagation" }],
    resources: [
      {
        id: "r_slides",
        moduleId: "m_backprop",
        type: "pdf",
        tag: "lecture",
        title: "Demo slides",
        hash: "demo",
        pages,
        extractionStatus: "done",
      },
    ],
    concepts,
    edges,
    questions,
  }))
    for (const row of rows) if (!(await s.get(n, row.id))) await s.put(n, row);
  return { ok: true };
}
export function tree(
  subjects: any[],
  exams: any[],
  modules: any[],
  resources: any[],
) {
  return subjects.map((s) => ({
    ...s,
    exams: exams
      .filter((e) => e.subjectId === s.id)
      .map((e) => ({
        ...e,
        modules: modules
          .filter((m) => m.examId === e.id)
          .map((m) => ({
            ...m,
            resources: resources.filter((r) => r.moduleId === m.id),
          })),
      })),
  }));
}
