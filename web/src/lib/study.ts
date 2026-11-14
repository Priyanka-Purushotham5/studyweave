import type { Concept, CorrectionResponse, Evidence, Flag, Resource, Tree, Word } from "../../../contracts/types";

export interface Branch {
  id: string;
  name: string;
  kind: "subject" | "exam" | "module" | "resource";
  parent?: string;
  depth: number;
  children: boolean;
  resource?: Resource;
}

export function treeToNodes(tree: Tree, collapsed: ReadonlySet<string> = new Set()) {
  const nodes: Branch[] = [];
  for (const subject of tree.subjects) {
    nodes.push({ ...subject, kind: "subject", depth: 1, children: !!subject.exams.length });
    if (collapsed.has(subject.id)) continue;
    for (const exam of subject.exams) {
      nodes.push({ ...exam, kind: "exam", parent: subject.id, depth: 2, children: !!exam.modules.length });
      if (collapsed.has(exam.id)) continue;
      for (const mod of exam.modules) {
        nodes.push({ ...mod, kind: "module", parent: exam.id, depth: 3, children: !!mod.resources.length });
        if (collapsed.has(mod.id)) continue;
        for (const resource of mod.resources) {
          nodes.push({ id: resource.id, name: resource.title, kind: "resource", parent: mod.id, depth: 4, children: false, resource });
        }
      }
    }
  }
  const edges = nodes.flatMap(node => node.parent ? [{ from: node.parent, to: node.id }] : []);
  return { nodes, edges };
}

export function colorFor(readiness?: number | null, cleared = false) {
  if (cleared) return { key: "cleared", label: "Cleared", icon: "★" };
  if (readiness == null) return { key: "untested", label: "Untested", icon: "○" };
  if (readiness < 40) return { key: "weak", label: "Weak", icon: "!" };
  if (readiness < 70) return { key: "developing", label: "Developing", icon: "◐" };
  return { key: "strong", label: "Strong", icon: "✓" };
}

export function applyCorrection(words: Word[], flags: Flag[], start: number, end: number, replacement: string): CorrectionResponse {
  const pieces = replacement.trim().split(/\s+/).filter(Boolean);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > words.length || !pieces.length) {
    throw new Error("Choose a transcript span and enter a replacement.");
  }
  const startSec = words[start].startSec;
  const step = (words[end - 1].endSec - startSec) / pieces.length;
  const delta = pieces.length - (end - start);
  return {
    words: [...words.slice(0, start), ...pieces.map((w, index) => ({ w, startSec: startSec + step * index, endSec: startSec + step * (index + 1) })), ...words.slice(end)],
    flags: flags.flatMap(flag => {
      if (flag.endIdx <= start) return [flag];
      if (flag.startIdx >= end) return [{ ...flag, startIdx: flag.startIdx + delta, endIdx: flag.endIdx + delta }];
      return [];
    }),
  };
}

export function resourceUrl(resource: Resource, apiUrl: (path: string) => string, evidence?: Evidence) {
  const link = resource.url?.startsWith("/api/") ? apiUrl(resource.url.slice(4)) :
    resource.url ?? apiUrl(`/resources/${encodeURIComponent(resource.id)}/file`);
  const url = new URL(link, window.location.href);
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (resource.type === "pdf" && evidence) url.hash = `page=${evidence.page}`;
  if (resource.type === "youtube" && evidence?.startSec != null) url.searchParams.set("t", String(Math.floor(evidence.startSec)));
  return url.href;
}

export function timestamp(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function bestEvidence(concept: Concept) {
  return concept.evidence.find(item => item.startSec != null) ?? concept.evidence[0];
}

export function readSaved<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; }
  catch { return fallback; }
}
