import { fixture } from "./sharedFixtures.js";
import { hash } from "../ai/aiClient.js";
import { publicResource } from "./public.js";
import { Store } from "../db/store.js";
import { concepts, edges, questions, pages } from "../fixtures/demo.js";
export async function seedLegacy(s: Store) {
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
  return {
    subjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      exams: exams
        .filter((e) => e.subjectId === s.id)
        .map((e) => ({
          id: e.id,
          name: e.name,
          ...(e.date ? { date: e.date } : {}),
          modules: modules
            .filter((m) => m.examId === e.id)
            .map((m) => ({
              id: m.id,
              name: m.name,
              resources: resources
                .filter((r) => r.moduleId === m.id)
                .map(publicResource),
            })),
        })),
    })),
  };
}

/** The default demo is always loaded from the agreed team fixtures. */
export async function seed(s: Store) {
  const tree = fixture("tree"),
    graph = fixture("graph"),
    questions = fixture("questions").questions;
  const rows: Record<string, any[]> = {
    subjects: [],
    exams: [],
    modules: [],
    resources: [],
    concepts: graph.nodes,
    edges: graph.edges,
    questions,
  };
  for (const subject of tree.subjects) {
    const { exams, ...sr } = subject;
    rows.subjects.push(sr);
    for (const exam of exams) {
      const { modules, ...er } = exam;
      rows.exams.push({ ...er, subjectId: sr.id });
      for (const mod of modules) {
        const { resources, ...mr } = mod;
        rows.modules.push({ ...mr, examId: er.id });
        for (const resource of resources)
          rows.resources.push({
            ...resource,
            hash: hash({ seed: resource.id }),
            ...(resource.pages
              ? {
                  pages: resource.pages.map((p: any) => ({
                    ...p,
                    resourceId: resource.id,
                  })),
                }
              : {}),
          });
      }
    }
  }
  for (const [name, values] of Object.entries(rows))
    for (const row of values)
      if (!(await s.get(name, row.id))) await s.put(name, row);
  return { ok: true };
}
