import type { AttemptRequest, CorrectionRequest, Graph, Lecture, QuestionsNextRequest, Resource, Tree } from "../../../contracts/types";
import seedTree from "../../../fixtures/tree.json";
import seedGraph from "../../../fixtures/graph.json";
import seedQuestions from "../../../fixtures/questions.json";
import seedAttempt from "../../../fixtures/attempt_response.json";
import seedPlan from "../../../fixtures/revision_plan.json";
import seedLecture from "../../../fixtures/lecture.json";
import demoSlides from "../../../fixtures/files/sample.pdf?url";
import seedAnswer from "../../../fixtures/ai_raw/answer.json";
import { ApiError } from "../api/client";
import { applyCorrection, readSaved } from "../lib/study";

const tree = readSaved("studyweave-demo-tree", seedTree as Tree);
const graph = readSaved("studyweave-demo-graph", seedGraph as Graph);
const lectures = new Map([["demo", structuredClone(seedLecture) as Lecture]]);
const questions = seedQuestions.questions;
const files = new Map<string, string>();
const quizOrder = ["q_backprop_1", "q_chain_rule_1", "q_act_1", "q_backprop_2", "q_gd_1", "q_paper_1", "q_gd_2"];

function moduleById(id: string) {
  const mod = tree.subjects.flatMap(subject => subject.exams).flatMap(exam => exam.modules).find(mod => mod.id === id);
  if (!mod) throw new ApiError("not_found", "Module not found.");
  return mod;
}

export function demoFile(resourceId: string) { return files.get(resourceId) ?? (resourceId === "r1" ? demoSlides : undefined); }

export function removeResource(id: string) {
  const owner = tree.subjects.flatMap(s => s.exams.flatMap(e => e.modules)).find(m => m.resources.some(r => r.id === id));
  if (!owner) throw new ApiError("not_found", "Material not found");
  owner.resources = owner.resources.filter(r => r.id !== id);
  const gone = new Set(graph.nodes.filter(n => n.evidence.length && n.evidence.every(e => e.resourceId === id)).map(n => n.id));
  graph.nodes = graph.nodes.filter(n => !gone.has(n.id)).map(n => ({ ...n, evidence: n.evidence.filter(e => e.resourceId !== id) }));
  graph.edges = graph.edges.filter(e => !gone.has(e.from) && !gone.has(e.to) && e.evidence.from.resourceId !== id && e.evidence.to.resourceId !== id);
  saveTree();
  localStorage.setItem("studyweave-demo-graph", JSON.stringify(graph));
}
function saveTree() { localStorage.setItem("studyweave-demo-tree", JSON.stringify(tree)); }

export function respond(path: string, payload?: object): unknown {
  const { pathname, searchParams } = new URL(path, "https://demo.studyweave.invalid");
  const body = payload as Record<string, string>;
  if (pathname === "/tree") return structuredClone(tree);
  if (pathname === "/graph") {
    const subject = tree.subjects.find(subject => subject.id === searchParams.get("subjectId"));
    const ids = new Set(subject?.exams.flatMap(exam => exam.modules.map(mod => mod.id)));
    const nodes = graph.nodes.filter(node => ids.has(node.moduleId));
    return structuredClone({ nodes, edges: graph.edges.filter(edge => nodes.some(node => node.id === edge.from) && nodes.some(node => node.id === edge.to)) });
  }
  if (pathname === "/subjects" || pathname === "/exams" || pathname === "/modules") {
    const row = { id: crypto.randomUUID(), name: body.name };
    if (pathname === "/subjects") tree.subjects.push({ ...row, exams: [] });
    if (pathname === "/exams") tree.subjects.find(s => s.id === body.subjectId)?.exams.push({ ...row, date: body.date, modules: [] });
    if (pathname === "/modules") tree.subjects.flatMap(s => s.exams).find(e => e.id === body.examId)?.modules.push({ ...row, resources: [] });
    saveTree();
    return row;
  }
  if (pathname === "/resources/upload" && payload instanceof FormData) {
    const file = payload.get("file") as File;
    if (/scanned/i.test(file.name)) throw new ApiError("scanned_pdf");
    const resource: Resource = {
      id: crypto.randomUUID(), moduleId: String(payload.get("moduleId")), title: file.name,
      type: /\.pdf$/i.test(file.name) ? "pdf" : "pptx", tag: payload.get("tag") as Resource["tag"], extractionStatus: "done",
    };
    files.set(resource.id, URL.createObjectURL(file));
    moduleById(resource.moduleId).resources.push(resource);
    saveTree();
    return resource;
  }
  if (pathname === "/resources") {
    const resource: Resource = { id: crypto.randomUUID(), moduleId: body.moduleId, title: new URL(body.url).hostname, type: body.type as Resource["type"], url: body.url, extractionStatus: "done" };
    moduleById(resource.moduleId).resources.push(resource);
    saveTree();
    return resource;
  }
  if (/^\/modules\/[^/]+\/build$/.test(pathname)) {
    if (pathname !== "/modules/m_backprop/build") throw new ApiError("ai_unavailable");
    return { jobId: "demo-build" };
  }
  if (pathname.startsWith("/jobs/") || /^\/resources\/[^/]+\/status$/.test(pathname)) return { status: "done" };
  if (pathname === "/questions/next") {
    const { moduleId, conceptId, difficulty, kind, n } = payload as QuestionsNextRequest;
    const eligible = quizOrder.map(id => questions.find(question => question.id === id)!).filter(question =>
      graph.nodes.some(node => node.moduleId === moduleId && question.conceptIds.includes(node.id)) &&
      (!conceptId || question.conceptIds.includes(conceptId)) && (!difficulty || difficulty === question.difficulty) && (!kind || kind === question.kind));
    return { questions: eligible.slice(0, n) };
  }
  if (pathname === "/attempts") {
    const { conceptId, correct } = payload as AttemptRequest;
    const node = graph.nodes.find(node => node.id === conceptId);
    if (!node) throw new ApiError("not_found", "Concept not found.");
    const demoMiss = !correct && conceptId === "c_backpropagation";
    node.readiness = demoMiss ? seedAttempt.readiness.c_backpropagation : Math.max(0, Math.min(100, (node.readiness ?? 50) + (correct ? 12 : -10)));
    localStorage.setItem("studyweave-demo-graph", JSON.stringify(graph));
    return {
      readiness: Object.fromEntries(graph.nodes.map(node => [node.id, node.readiness])),
      trace: demoMiss ? seedAttempt.trace : null, xp: correct ? 10 : 0,
    };
  }
  if (pathname === "/ask") {
    if (body.moduleId !== "m_backprop" || (!body.kind && !/chain|backprop|gradient/i.test(body.question))) {
      return { refused: true, reason: "not_in_materials" };
    }
    if (body.kind === "formula_sheet") {
      const page = seedTree.subjects[0].exams[0].modules[0].resources[0].pages?.[1];
      return { answer: "Chain rule: if y = f(g(x)), then dy/dx = f′(g(x)) · g′(x).", citations: [
        { resourceId: "r1", page: 2, quote: page?.text.match(/If y = .*?\./)?.[0] ?? seedAnswer.citations[0].quote },
      ] };
    }
    return seedAnswer;
  }
  if (pathname === "/revision-plan") {
    if (!tree.subjects.flatMap(s => s.exams).some(e => e.id === searchParams.get("examId") && e.modules.some(m => m.id === "m_backprop"))) return [];
    const budget = Number(searchParams.get("minutesPerDay"));
    let remaining = budget;
    return seedPlan.flatMap(item => {
      if (remaining < 5) return [];
      const minutes = Math.min(remaining, item.minutes);
      remaining -= minutes;
      return [{ ...item, minutes }];
    });
  }
  if (pathname === "/revision-path") {
    const conceptId = searchParams.get("conceptId");
    return conceptId === "c_backpropagation"
      ? [{ kind: "review", conceptId: "c_chain_rule" }, { kind: "practice", conceptId: "c_chain_rule" }, { kind: "practice", conceptId: "c_chain_rule" }, { kind: "retry", conceptId }]
      : [{ kind: "retry", conceptId }];
  }
  if (pathname === "/lectures" && payload instanceof FormData) {
    const lectureId = crypto.randomUUID();
    lectures.set(lectureId, structuredClone(seedLecture) as Lecture);
    return { lectureId, jobId: "demo-lecture" };
  }
  if (pathname.startsWith("/lectures/")) {
    const [, , lectureId, action] = pathname.split("/");
    const lecture = lectures.get(lectureId);
    if (!lecture) throw new ApiError("not_found", "Lecture not found.");
    if (!action) return structuredClone(lecture);
    const correction = payload as CorrectionRequest;
    const span = "flagId" in correction
      ? lecture.flags.find(flag => flag.id === correction.flagId)
      : correction;
    if (!span) throw new ApiError("not_found", "This suggestion was already handled.");
    const updated = applyCorrection(lecture.words, lecture.flags, span.startIdx, span.endIdx, "to" in span ? span.to : span.suggestion);
    Object.assign(lecture, updated);
    return updated;
  }
  throw new ApiError("not_found");
}
