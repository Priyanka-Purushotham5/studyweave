import { http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { ApiError } from "../api/client";
import { respond } from "./fixtures";

const statuses: Record<string, number> = {
  bad_request: 400, not_found: 404, scanned_pdf: 422,
  rate_limited: 429, ai_unavailable: 503, internal: 500,
};

export const worker = setupWorker(http.all("*/api/*", async ({ request }) => {
  const url = new URL(request.url);
  const path = url.pathname.slice("/api".length) + url.search;
  try {
    let payload: object | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      payload = request.headers.get("content-type")?.includes("multipart/form-data")
        ? await request.formData() : await request.json() as object;
    }
    return new HttpResponse(JSON.stringify(respond(path, payload)), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    const e = error instanceof ApiError ? error : new ApiError("internal");
    return HttpResponse.json({ error: { code: e.code, message: e.message } }, { status: statuses[e.code] ?? 500 });
  }
}));
