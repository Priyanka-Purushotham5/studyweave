import { sharedSchemas } from "./shared.js";
import { schemas, responses } from "./schemas.js";
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: any) => ({ "application/json": { schema } });
const response = (name: string, description = "Successful response") => ({
  description,
  content: json(ref(name)),
});
const body = (name: string) => ({ required: true, content: json(ref(name)) });
const query = (name: string, schema: any, required = true) => ({
  name,
  in: "query",
  required,
  schema,
});
const param = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", minLength: 1 },
};
const definitions: any = {
  ...sharedSchemas.$defs,
  ...Object.fromEntries(Object.entries(schemas).map(([k, v]) => ["B_" + k, v])),
  Health: responses.health,
  CreatedRow: responses.created,
  BuildStarted: responses.jobId,
  LectureStarted: responses.lectureId,
  RevisionPath: responses.revisionPath,
};
function rewrite(value: any): any {
  if (typeof value === "string")
    return value.replace(/^#\/\$defs\//, "#/components/schemas/");
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, rewrite(v)]),
    );
  return value;
}
const operation = (output: string, input?: string, status = "200") => ({
  ...(input ? { requestBody: body(input) } : {}),
  responses: {
    [status]: response(output),
    "400": response("Error", "Invalid request"),
    "404": response("Error", "Not found"),
    "503": response("Error", "AI unavailable"),
  },
});
const pathOperation = (output: string) => ({
  parameters: [param],
  ...operation(output),
});
const multipart = (fields: string[], properties: any) => ({
  required: true,
  content: {
    "multipart/form-data": {
      schema: {
        type: "object",
        required: fields,
        additionalProperties: false,
        properties,
      },
    },
  },
});
const file = {
  type: "string",
  format: "binary",
  description:
    "Maximum 20,000,000 bytes; PDF/PPTX document signatures are verified",
};
export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "StudyNova Module B API",
    version: "3.0.0",
    description:
      "Shared definitions are bundled from contracts/schemas.json unchanged. B_* schemas document endpoint inputs not yet present in the shared package. Demo proxy uses HTTP Basic auth over TLS.",
  },
  servers: [{ url: "/" }],
  components: {
    schemas: rewrite(definitions),
    securitySchemes: { DemoBasic: { type: "http", scheme: "basic" } },
  },
  security: [{ DemoBasic: [] }],
  paths: {
    "/healthz": { get: { security: [], ...operation("Health") } },
    "/readyz": { get: { security: [], ...operation("Health") } },
    "/api/tree": { get: operation("Tree") },
    "/api/subjects": { post: operation("CreatedRow", "B_subject", "201") },
    "/api/exams": { post: operation("CreatedRow", "B_exam", "201") },
    "/api/modules": { post: operation("CreatedRow", "B_module", "201") },
    "/api/resources": { post: operation("Resource", "B_resource", "201") },
    "/api/resources/upload": {
      post: {
        ...operation("Resource", undefined, "201"),
        requestBody: multipart(["file", "moduleId", "tag"], {
          file,
          moduleId: { type: "string" },
          tag: { enum: ["lecture", "notes", "past_paper", "model_paper"] },
        }),
      },
    },
    "/api/resources/{id}": {
      delete: {
        summary:
          "Delete a material and the concepts, links and questions learned only from it",
        parameters: [param],
        responses: {
          "204": { description: "Deleted" },
          "404": response("Error", "Material not found"),
        },
      },
    },
    "/api/resources/{id}/status": { get: pathOperation("JobStatus") },
    "/api/resources/{id}/file": {
      get: {
        parameters: [
          param,
          { name: "Range", in: "header", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Original PDF/PPTX bytes" },
          "206": { description: "Requested byte range" },
          "416": response("Error", "Invalid byte range"),
        },
      },
    },
    "/api/modules/{id}/build": {
      post: {
        parameters: [param],
        ...operation("BuildStarted", undefined, "202"),
      },
    },
    "/api/jobs/{id}": { get: pathOperation("JobStatus") },
    "/api/graph": {
      get: {
        parameters: [query("subjectId", { type: "string" }, false)],
        ...operation("Graph"),
      },
    },
    "/api/questions/next": {
      post: operation("QuestionsNextResponse", "QuestionsNextRequest"),
    },
    "/api/attempts": { post: operation("AttemptResponse", "AttemptRequest") },
    "/api/ask": { post: operation("AnswerResponse", "B_ask") },
    "/api/revision-plan": {
      get: {
        parameters: [
          query("examId", { type: "string" }),
          query("minutesPerDay", {
            type: "integer",
            minimum: 1,
            maximum: 1440,
          }),
        ],
        ...operation("RevisionPlan"),
      },
    },
    "/api/revision-path": {
      get: {
        parameters: [query("conceptId", { type: "string" })],
        ...operation("RevisionPath"),
      },
    },
    "/api/lectures": {
      post: {
        ...operation("LectureStarted", undefined, "202"),
        requestBody: multipart(["audio", "moduleId", "slidesResourceId"], {
          audio: file,
          moduleId: { type: "string" },
          slidesResourceId: { type: "string" },
        }),
      },
    },
    "/api/lectures/{id}": { get: pathOperation("Lecture") },
    "/api/lectures/{id}/audio": {
      get: {
        parameters: [
          param,
          { name: "Range", in: "header", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Original audio bytes" },
          "206": { description: "Requested audio byte range" },
          "416": response("Error", "Invalid byte range"),
        },
      },
    },
    "/api/lectures/{id}/corrections": {
      post: {
        parameters: [param],
        ...operation("CorrectionResponse", "CorrectionRequest"),
      },
    },
    "/api/dev/seed": {
      post: {
        description: "Development-only; disabled in production",
        ...operation("Health"),
      },
    },
  },
};
