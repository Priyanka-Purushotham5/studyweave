const str = { type: "string", minLength: 1, maxLength: 2000 };
const id = { type: "string", minLength: 1, maxLength: 200 };
const obj = (properties: any, required: string[]) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
export const schemas: Record<string, any> = {
  subject: obj({ name: str }, ["name"]),
  exam: obj(
    {
      name: str,
      subjectId: id,
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
    ["name", "subjectId"],
  ),
  module: obj({ name: str, examId: id }, ["name", "examId"]),
  resource: obj(
    {
      moduleId: id,
      type: { enum: ["web", "youtube"] },
      url: { type: "string", maxLength: 4000 },
      title: str,
      text: { type: "string", maxLength: 2000000 },
    },
    ["moduleId", "type", "url"],
  ),
  questions: obj(
    {
      moduleId: id,
      conceptId: id,
      kind: { enum: ["mcq", "conceptual", "numerical", "past_paper"] },
      difficulty: { type: "integer", minimum: 1, maximum: 3 },
      n: { type: "integer", minimum: 1, maximum: 50 },
    },
    ["moduleId", "n"],
  ),
  attempt: obj(
    { questionId: id, conceptId: id, correct: { type: "boolean" } },
    ["questionId", "conceptId", "correct"],
  ),
  ask: obj(
    {
      moduleId: id,
      question: str,
      kind: { enum: ["summary", "formula_sheet"] },
    },
    ["moduleId"],
  ),
  correction: {
    oneOf: [
      obj({ flagId: id }, ["flagId"]),
      obj(
        {
          startIdx: { type: "integer", minimum: 0 },
          endIdx: { type: "integer", minimum: 1 },
          to: { type: "string", minLength: 1, maxLength: 1000 },
        },
        ["startIdx", "endIdx", "to"],
      ),
    ],
  },
};
export const errorSchema = obj(
  {
    error: obj(
      {
        code: {
          enum: [
            "bad_request",
            "not_found",
            "rate_limited",
            "ai_unavailable",
            "internal",
          ],
        },
        message: str,
      },
      ["code", "message"],
    ),
  },
  ["error"],
);
const array = (items: any) => ({ type: "array", items });
const nullableNumber = { type: ["number", "null"], minimum: 0, maximum: 100 };
export const evidenceSchema = obj(
  {
    resourceId: id,
    page: { type: "integer", minimum: 1 },
    quote: { type: "string", minLength: 1 },
    startSec: { type: "number", minimum: 0 },
  },
  ["resourceId", "page", "quote"],
);
export const conceptSchema = obj(
  {
    id,
    moduleId: id,
    name: str,
    definition: { type: "string" },
    evidence: array(evidenceSchema),
    examWeight: { type: "number", minimum: 0 },
    readiness: nullableNumber,
  },
  [
    "id",
    "moduleId",
    "name",
    "definition",
    "evidence",
    "examWeight",
    "readiness",
  ],
);
export const edgeSchema = obj(
  {
    id,
    from: id,
    to: id,
    type: { enum: ["prerequisite", "extends", "contrasts"] },
    reason: str,
    evidence: obj({ from: evidenceSchema, to: evidenceSchema }, ["from", "to"]),
  },
  ["id", "from", "to", "type", "reason", "evidence"],
);
export const questionSchema = obj(
  {
    id,
    conceptIds: { ...array(id), minItems: 1 },
    kind: { enum: ["mcq", "conceptual", "numerical", "past_paper"] },
    difficulty: { type: "integer", minimum: 1, maximum: 3 },
    text: { type: "string", minLength: 1 },
    options: array(str),
    answer: { type: "string" },
    citations: { ...array(evidenceSchema), minItems: 1 },
    verified: { const: true },
  },
  [
    "id",
    "conceptIds",
    "kind",
    "difficulty",
    "text",
    "options",
    "answer",
    "citations",
    "verified",
  ],
);
export const graphSchema = obj(
  { nodes: array(conceptSchema), edges: array(edgeSchema) },
  ["nodes", "edges"],
);
const traceSchema = obj(
  {
    rootConceptId: id,
    path: array(id),
    readiness: nullableNumber,
    evidence: array(evidenceSchema),
    status: { enum: ["likely", "possible"] },
  },
  ["rootConceptId", "path", "readiness", "evidence", "status"],
);
const wordSchema = obj(
  {
    w: { type: "string" },
    startSec: { type: "number", minimum: 0 },
    endSec: { type: "number", minimum: 0 },
  },
  ["w", "startSec", "endSec"],
);
const flagSchema = obj(
  {
    id,
    startIdx: { type: "integer", minimum: 0 },
    endIdx: { type: "integer", minimum: 1 },
    heard: { type: "string" },
    suggestion: str,
    score: { type: "number" },
    reason: str,
  },
  ["id", "startIdx", "endIdx", "heard", "suggestion", "score", "reason"],
);
const resourceSchema = {
  type: "object",
  required: ["id", "moduleId", "type", "title", "pages", "extractionStatus"],
  properties: {
    id,
    moduleId: id,
    type: { enum: ["pdf", "pptx", "web", "youtube"] },
    title: { type: "string" },
    pages: array({
      type: "object",
      required: ["n", "text", "resourceId"],
      properties: {
        n: { type: "integer", minimum: 1 },
        text: { type: "string" },
        resourceId: id,
      },
    }),
    extractionStatus: { enum: ["pending", "done", "unsupported"] },
  },
};
const moduleSchema = {
  type: "object",
  required: ["id", "name", "examId", "resources"],
  properties: { id, name: str, examId: id, resources: array(resourceSchema) },
};
const examSchema = {
  type: "object",
  required: ["id", "name", "subjectId", "modules"],
  properties: { id, name: str, subjectId: id, modules: array(moduleSchema) },
};
export const responses: Record<string, any> = {
  health: obj({ ok: { const: true } }, ["ok"]),
  tree: array({
    type: "object",
    required: ["id", "name", "exams"],
    properties: { id, name: str, exams: array(examSchema) },
  }),
  created: {
    type: "object",
    required: ["id", "name"],
    properties: { id, name: str },
  },
  resource: resourceSchema,
  jobId: obj({ jobId: id }, ["jobId"]),
  job: {
    type: "object",
    required: ["id", "status"],
    properties: {
      id,
      status: { enum: ["queued", "running", "done", "failed"] },
      error: { type: "string" },
    },
  },
  graph: graphSchema,
  questions: obj({ questions: array(questionSchema) }, ["questions"]),
  attempt: obj(
    {
      readiness: { type: "object", additionalProperties: nullableNumber },
      trace: { anyOf: [traceSchema, { type: "null" }] },
      xp: { type: "integer", minimum: 0 },
    },
    ["readiness", "trace", "xp"],
  ),
  ask: {
    oneOf: [
      obj({ refused: { const: true }, reason: { const: "not_in_materials" } }, [
        "refused",
        "reason",
      ]),
      obj(
        {
          answer: { type: "string" },
          citations: { ...array(evidenceSchema), minItems: 1 },
        },
        ["answer", "citations"],
      ),
    ],
  },
  revisionPlan: array(
    obj(
      {
        conceptId: id,
        name: str,
        priority: { type: "number", minimum: 0 },
        minutes: { type: "integer", minimum: 5 },
      },
      ["conceptId", "name", "priority", "minutes"],
    ),
  ),
  revisionPath: array({
    type: "object",
    required: ["kind", "conceptId"],
    properties: {
      kind: { enum: ["review", "practice", "retry"] },
      conceptId: id,
    },
  }),
  lectureId: obj({ lectureId: id, jobId: id }, ["lectureId", "jobId"]),
  lecture: {
    type: "object",
    required: ["words", "flags", "glossary", "status"],
    properties: {
      words: array(wordSchema),
      flags: array(flagSchema),
      glossary: array({ type: "object" }),
      status: { enum: ["queued", "running", "done", "failed"] },
    },
  },
  correction: obj({ words: array(wordSchema), flags: array(flagSchema) }, [
    "words",
    "flags",
  ]),
  error: errorSchema,
};
