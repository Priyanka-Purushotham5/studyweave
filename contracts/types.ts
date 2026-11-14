// TypeScript mirror of contracts/schemas.json. If the two disagree, schemas.json wins.
// Change by pull request only; the person it affects must approve.

export type ErrorCode =
  | "bad_request" // 400
  | "scanned_pdf" // 422
  | "not_found" // 404
  | "rate_limited" // 429
  | "ai_unavailable" // 503
  | "internal"; // 500
export interface ApiErrorBody { error: { code: ErrorCode; message: string } }

export interface Evidence { resourceId: string; page: number; quote: string; startSec?: number }
export interface Page { n: number; text: string; startSec?: number }
export interface ResourcePage extends Page { resourceId: string }

/** id = "c_" + snake_case(name), e.g. "Chain rule" -> "c_chain_rule". */
export interface Concept {
  id: string; moduleId: string; name: string; definition: string; evidence: Evidence[];
  examWeight?: number; readiness?: number | null; // filled in by B; null = no attempts
}
export interface ExtractedConcept { name: string; definition: string; evidence: Evidence[] }

export type EdgeType = "prerequisite" | "extends" | "contrasts";
/** prerequisite: `from` before `to`. extends: `to` builds on `from`. contrasts: symmetric. */
export interface Edge {
  id: string; from: string; to: string; type: EdgeType; reason: string;
  evidence: { from: Evidence; to: Evidence };
}

export type QuestionKind = "mcq" | "conceptual" | "numerical" | "past_paper";
export interface Question {
  id: string; conceptIds: string[]; kind: QuestionKind; text: string;
  options: string[]; // 4 for mcq/past_paper, [] for conceptual/numerical
  answer: string; // "A".."D" for mcq/past_paper, short model answer otherwise
  difficulty: 1 | 2 | 3; citations: Evidence[]; verified: true;
}

export interface Word { w: string; startSec: number; endSec: number }
/** startIdx inclusive, endIdx exclusive, indexes into words[] */
export interface Flag { id: string; startIdx: number; endIdx: number; heard: string; suggestion: string; score: number; reason: string }
export interface GlossaryTerm { term: string; definition: string }
export interface Correction { heard: string; correct: string; count: number }
export interface AutoFix { startIdx: number; endIdx: number; to: string }

export interface Trace {
  rootConceptId: string; path: string[]; readiness: number | null; evidence: Evidence;
  status: "likely" | "possible"; // UI says "likely gap", never "cause"
}

export type ExtractionStatus = "pending" | "done" | "unsupported";
export interface Resource {
  id: string; moduleId: string; type: "pdf" | "pptx" | "web" | "youtube"; title: string; url?: string;
  tag?: "lecture" | "notes" | "past_paper" | "model_paper"; extractionStatus: ExtractionStatus; pages?: Page[];
}
export interface Module { id: string; name: string; resources: Resource[] }
export interface Exam { id: string; name: string; date?: string; modules: Module[] }
export interface Subject { id: string; name: string; exams: Exam[] }
export interface Tree { subjects: Subject[] }
export interface Graph { nodes: Concept[]; edges: Edge[] }

// ---- Module A endpoints (B calls these) ----
export interface ParseResponse { pages: Page[] } // 422 scanned_pdf when no text
export interface VideoTextRequest { url: string }
export interface VideoTextResponse { pages: Page[]; approximateTimestamps: boolean }
export interface GlossaryRequest { pages: Page[] }
export interface GlossaryResponse { terms: GlossaryTerm[] }
export interface TranscribeResponse { words: Word[]; text: string }
export interface FlagRequest { words: Word[]; glossary: GlossaryTerm[]; corrections?: Correction[] }
export interface FlagResponse { flags: Flag[]; autoFixed: AutoFix[] }
export interface ConceptsExtractRequest { moduleId: string; pages: ResourcePage[] }
export interface ConceptsExtractResponse { concepts: ExtractedConcept[]; dropped: number }
export interface EmbedRequest { texts: string[] }
export interface EmbedResponse { vectors: number[][] } // 768 numbers each
export interface EdgesTypeRequest { pairs: { a: Concept; b: Concept }[]; pages: ResourcePage[] }
export interface EdgesTypeResponse { edges: (Edge | null)[] } // one per pair, in order
export interface QuestionsGenerateRequest { concept: Concept; pages: ResourcePage[]; kind: QuestionKind; n: number }
export interface QuestionsGenerateResponse { questions: Question[]; dropped: number; refused?: true }
export interface PapersTagRequest { pages: Page[]; concepts: string[] }
export interface PapersTagResponse { questions: { text: string; concepts: string[] }[] }
export type AnswerRequest =
  | { question: string; pages: ResourcePage[] }
  | { kind: "summary" | "formula_sheet"; pages: ResourcePage[] };
export type AnswerResponse =
  | { answer: string; citations: Evidence[] }
  | { refused: true; reason: "not_in_materials" };
export interface SuggestModuleRequest { title: string; snippet: string; modules: { id: string; path: string }[] }
export interface SuggestModuleResponse { moduleId: string | null; confidence: number }

// ---- Module B endpoints (C calls these) ----
export interface QuestionsNextRequest { moduleId: string; kind?: QuestionKind; n: number; conceptId?: string; difficulty?: 1 | 2 | 3 }
export interface QuestionsNextResponse { questions: Question[] }
export interface AttemptRequest { questionId: string; conceptId: string; correct: boolean }
export interface AttemptResponse { readiness: Record<string, number | null>; trace: Trace | null; xp: number }
export type RevisionPlan = { conceptId: string; name: string; priority: number; minutes: number }[];
export interface JobStatus { status: "queued" | "running" | "done" | "failed"; error?: string }
export interface Lecture { words: Word[]; flags: Flag[]; glossary: GlossaryTerm[]; status: JobStatus["status"] }
export type CorrectionRequest = { flagId: string } | { startIdx: number; endIdx: number; to: string };
export interface CorrectionResponse { words: Word[]; flags: Flag[] }
