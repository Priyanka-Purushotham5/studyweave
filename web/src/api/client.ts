import type {
  AnswerResponse, ApiErrorBody, AttemptRequest, AttemptResponse, CorrectionRequest, CorrectionResponse,
  ErrorCode, Graph, JobStatus, Lecture, QuestionsNextRequest, QuestionsNextResponse, Resource, RevisionPlan, Tree,
} from "../../../contracts/types";

const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const messages: Record<ErrorCode | "offline", string> = {
  bad_request: "Check the information you entered and try again.",
  not_found: "That item could not be found.",
  scanned_pdf: "This PDF has no selectable text. Upload a text-based PDF or run OCR first.",
  rate_limited: "Too many requests. Wait a moment and try again.",
  ai_unavailable: "The study assistant is temporarily unavailable.",
  internal: "Something went wrong. Try again in a moment.",
  offline: "StudyNova could not reach the server. Check your connection and try again.",
};

export class ApiError extends Error {
  constructor(readonly code: keyof typeof messages, detail?: string) {
    super(detail && (code === "bad_request" || code === "not_found") ? detail : messages[code]);
  }
}

export const apiUrl = (path: string) => `${base}/api${path}`;
const id = encodeURIComponent;
async function request<T>(path: string, body?: object): Promise<T> {
  const options: RequestInit = body instanceof FormData
    ? { method: "POST", body }
    : body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {};
  let response: Response;
  try { response = await fetch(apiUrl(path), options); }
  catch { throw new ApiError("offline"); }
  const data = await response.json().catch(() => null);
  if (!response.ok || data == null) {
    const error = (data as ApiErrorBody | null)?.error;
    throw new ApiError(error && Object.hasOwn(messages, error.code) ? error!.code : response.status >= 500 ? "offline" : "internal", error?.message);
  }
  return data as T;
}

export function multipart(file: File, field: "file" | "audio", values: Record<string, string>) {
  const form = new FormData();
  form.set(field, file);
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

export const api = {
  tree: () => request<Tree>("/tree"),
  create: (kind: "subjects" | "exams" | "modules", body: object) => request<{ id: string }>(`/${kind}`, body),
  graph: (subjectId: string) => request<Graph>(`/graph?subjectId=${id(subjectId)}`),
  save: (body: { moduleId: string; url: string; type: "web" | "youtube" }) => request<Resource>("/resources", body),
  upload: (file: File, moduleId: string, tag: NonNullable<Resource["tag"]>) =>
    request<Resource>("/resources/upload", multipart(file, "file", { moduleId, tag })),
  extraction: (resourceId: string) => request<JobStatus>(`/resources/${id(resourceId)}/status`),
  build: (moduleId: string) => request<{jobId: string}>(`/modules/${id(moduleId)}/build`, {}),
  job: (jobId: string) => request<JobStatus>(`/jobs/${id(jobId)}`),
  questions: (body: QuestionsNextRequest) => request<QuestionsNextResponse>("/questions/next", body),
  attempt: (body: AttemptRequest) => request<AttemptResponse>("/attempts", body),
  ask: (moduleId: string, prompt: { question: string } | { kind: "formula_sheet" }) =>
    request<AnswerResponse>("/ask", { moduleId, ...prompt }),
  plan: (examId: string, minutes: number) => request<RevisionPlan>(`/revision-plan?examId=${id(examId)}&minutesPerDay=${minutes}`),
  path: (conceptId: string) => request<{ kind: "review" | "practice" | "retry"; conceptId: string }[]>(`/revision-path?conceptId=${id(conceptId)}`),
  transcribe: (file: File, moduleId: string, slidesResourceId: string) =>
    request<{ lectureId: string; jobId: string }>("/lectures", multipart(file, "audio", { moduleId, slidesResourceId })),
  lecture: (lectureId: string) => request<Lecture>(`/lectures/${id(lectureId)}`),
  correction: (lectureId: string, body: CorrectionRequest) =>
    request<CorrectionResponse>(`/lectures/${id(lectureId)}/corrections`, body),
};

export async function waitForJob(load: () => Promise<JobStatus>, onFailure?: () => void) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const job = await load();
    if (job.status === "done") return;
    if (job.status === "failed") {
      onFailure?.();
      if (/scanned|selectable text/i.test(job.error ?? "")) throw new ApiError("scanned_pdf");
      if (/unavailable|timed? ?out|rate.limit/i.test(job.error ?? "")) throw new ApiError("ai_unavailable");
      throw new Error(job.error ?? "Processing failed. Try again.");
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error("Processing is taking longer than expected. Check again shortly.");
}
