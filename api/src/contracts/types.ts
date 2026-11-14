export interface Evidence {
  resourceId: string;
  page: number;
  quote: string;
  startSec?: number;
}
export interface Page {
  n: number;
  text: string;
  resourceId: string;
  startSec?: number;
}
export interface Concept {
  id: string;
  moduleId: string;
  name: string;
  definition: string;
  evidence: Evidence[];
  examWeight: number;
  readiness: number | null;
  embedding?: number[];
}
export interface Edge {
  id: string;
  from: string;
  to: string;
  type: "prerequisite" | "extends" | "contrasts";
  reason: string;
  evidence: { from: Evidence; to: Evidence };
}
export interface Question {
  id: string;
  conceptIds: string[];
  kind: "mcq" | "conceptual" | "numerical" | "past_paper";
  difficulty: number;
  text: string;
  options: string[];
  answer: string;
  citations: Evidence[];
  verified: boolean;
}
export interface Attempt {
  id: string;
  questionId: string;
  conceptId: string;
  correct: boolean;
  createdAt: number;
}
export interface Word {
  w: string;
  startSec: number;
  endSec: number;
}
export interface Flag {
  id: string;
  startIdx: number;
  endIdx: number;
  heard: string;
  suggestion: string;
  score: number;
  reason: string;
}
export interface Trace {
  rootConceptId: string;
  path: string[];
  readiness: number | null;
  evidence: Evidence[];
  status: "likely" | "possible";
}
