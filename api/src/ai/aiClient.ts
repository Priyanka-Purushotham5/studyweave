import { fixture } from "../services/sharedFixtures.js";
import { verified } from "../services/citations.js";
import { sanitizeCapturedValue } from "../services/text.js";
import { createHash } from "node:crypto";
import { Store } from "../db/store.js";
import { ApiError } from "../services/errors.js";
import { pages as demoPages, concepts, edges } from "../fixtures/demo.js";
export interface AiClient {
  call(endpoint: string, body: any): Promise<any>;
  upload(
    endpoint: string,
    data: Buffer,
    filename: string,
    fields?: Record<string, string>,
  ): Promise<any>;
}
export const hash = (v: unknown): string =>
  createHash("sha256")
    .update(typeof v === "string" ? v : stable(v))
    .digest("hex");
function stable(v: any): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  return (
    "{" +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stable(v[k]))
      .join(",") +
    "}"
  );
}
export class HttpAiClient implements AiClient {
  constructor(
    private base: string,
    private timeout = 60000,
  ) {}
  private async request(endpoint: string, init: RequestInit) {
    let r: Response;
    try {
      r = await fetch(new URL(endpoint, this.base), {
        ...init,
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch {
      throw new ApiError("ai_unavailable", "AI service is unavailable");
    }
    let body: any;
    try {
      body = await r.json();
    } catch {
      throw new ApiError("ai_unavailable", "AI service returned invalid JSON");
    }
    if (!r.ok) {
      if (r.status === 422)
        throw new ApiError(
          body.error?.code === "scanned_pdf" ? "scanned_pdf" : "bad_request",
          body.error?.message ?? "Scanned PDFs require selectable text",
          422,
        );
      throw new ApiError(
        r.status === 429 ? "rate_limited" : "ai_unavailable",
        body.error?.message ?? "AI request failed",
      );
    }
    return body;
  }
  call(endpoint: string, body: any) {
    return this.request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  upload(
    endpoint: string,
    data: Buffer,
    filename: string,
    fields: Record<string, string> = {},
  ) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(data)]), filename);
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return this.request(endpoint, { method: "POST", body: form });
  }
}
export class LegacyFakeAiClient implements AiClient {
  calls = 0;
  async upload(
    endpoint: string,
    data: Buffer,
    _filename: string,
    fields: Record<string, string> = {},
  ) {
    if (data.toString().includes("SCANNED"))
      throw new ApiError(
        "bad_request",
        "Scanned PDF: no selectable text found",
        422,
      );
    return this.call(endpoint, fields);
  }
  async call(endpoint: string, b: any) {
    this.calls++;
    switch (endpoint) {
      case "/v1/parse":
      case "/v1/video/text":
        return { pages: demoPages.map(({ resourceId, ...p }) => p) };
      case "/v1/glossary":
        return {
          terms: [
            {
              term: "backpropagation",
              definition: "Layer-wise differentiation",
            },
          ],
        };
      case "/v1/concepts/extract":
        return {
          concepts: concepts
            .filter((c) =>
              b.pages.some((p: any) => p.text.includes(c.definition)),
            )
            .map((c) => ({
              ...c,
              evidence: c.evidence.map((e) => ({
                ...e,
                resourceId:
                  b.pages.find((p: any) => p.n === e.page)?.resourceId ??
                  e.resourceId,
              })),
            })),
          dropped: 0,
        };
      case "/v1/embed":
        return {
          vectors: b.texts.map((_: string, i: number) =>
            Array.from({ length: 768 }, (_, j) => (j === i % 3 ? 1 : 0)),
          ),
        };
      case "/v1/edges/type":
        return {
          edges: b.pairs.map(({ a, b: other }: any) => {
            const source = edges.find(
              (e) =>
                concepts.find((c) => c.id === e.from)?.name === a.name &&
                concepts.find((c) => c.id === e.to)?.name === other.name,
            );
            return source
              ? {
                  ...source,
                  from: a.id,
                  to: other.id,
                  evidence: { from: a.evidence[0], to: other.evidence[0] },
                }
              : null;
          }),
        };
      case "/v1/questions/generate":
        return {
          questions: Array.from({ length: Math.min(b.n, 3) }, (_, i) => ({
            id: `q_${b.concept.id}_${i + 1}_${b.kind}`,
            conceptIds: [b.concept.id],
            kind: b.kind,
            options: [],
            difficulty: i + 1,
            text: `Explain ${b.concept.name}.`,
            answer: b.concept.definition,
            citations: b.concept.evidence,
            verified: true,
            ...(b.kind === "mcq"
              ? { options: ["A", "B", "C", "D"], answer: "A" }
              : {}),
          })),
          dropped: 0,
        };
      case "/v1/answer":
        return /chain|backprop|gradient|summary|formula/i.test(
          b.question ?? b.kind ?? "",
        ) && b.pages.length
          ? {
              answer: b.pages[0].text,
              citations: [
                {
                  resourceId: b.pages[0].resourceId,
                  page: b.pages[0].n,
                  quote: b.pages[0].text,
                },
              ],
            }
          : { refused: true, reason: "not_in_materials" };
      case "/v1/papers/tag":
        return {
          questions: b.pages.map((p: any) => ({
            text: p.text,
            concepts: b.concepts.filter((n: string) =>
              p.text.toLowerCase().includes(n.toLowerCase()),
            ),
          })),
        };
      case "/v1/transcribe":
        return {
          words: [
            { w: "back", startSec: 0, endSec: 1 },
            { w: "propagation", startSec: 1, endSec: 2 },
          ],
          text: "back propagation",
        };
      case "/v1/flag": {
        const learned = b.corrections?.find(
          (c: any) => c.heard === "back propagation" && c.count >= 2,
        );
        return learned
          ? {
              flags: [],
              autoFixed: [{ startIdx: 0, endIdx: 2, to: learned.correct }],
            }
          : {
              flags: [
                {
                  id: "f1",
                  startIdx: 0,
                  endIdx: 2,
                  heard: "back propagation",
                  suggestion: "backpropagation",
                  score: 92,
                  reason: "close match to glossary term",
                },
              ],
              autoFixed: [],
            };
      }
      default:
        throw new ApiError("internal", `Unknown fake endpoint ${endpoint}`);
    }
  }
}
export class CachedAiClient implements AiClient {
  private inflight = new Map<string, Promise<any>>();
  constructor(
    private inner: AiClient,
    private store: Store,
    private sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  ) {}
  private async cached(id: string, fn: () => Promise<any>) {
    const row = await this.store.get("cache", id);
    if (row && new Date(row.expiresAt).getTime() > Date.now())
      return sanitizeCapturedValue(row.value);
    if (this.inflight.has(id)) return this.inflight.get(id);
    const p = (async () => {
      for (let i = 0; ; i++) {
        try {
          const value = sanitizeCapturedValue(await fn());
          await this.store.put("cache", {
            id,
            value,
            expiresAt: new Date(Date.now() + 86400000),
          });
          return value;
        } catch (e) {
          if (!(e instanceof ApiError) || e.code !== "rate_limited") throw e;
          if (i === 3)
            throw new ApiError(
              "ai_unavailable",
              "AI service remains rate limited; try again shortly",
            );
          await this.sleep(100 * 2 ** i);
        }
      }
    })();
    this.inflight.set(id, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(id);
    }
  }
  call(e: string, b: any) {
    return this.cached(hash({ e, b }), () => this.inner.call(e, b));
  }
  upload(e: string, d: Buffer, f: string, fields?: Record<string, string>) {
    return this.cached(hash({ e, d: d.toString("base64"), f, fields }), () =>
      this.inner.upload(e, d, f, fields),
    );
  }
}

/** Key-free neighbor fake backed by the exact shared fixtures used by A and C. */
export class FakeAiClient implements AiClient {
  calls = 0;
  async upload(
    endpoint: string,
    data: Buffer,
    filename: string,
    fields: Record<string, string> = {},
  ) {
    if (endpoint === "/v1/parse")
      return {
        pages: fixture("pages").pages.map(({ resourceId, ...p }: any) => p),
      };
    return this.call(endpoint, fields);
  }
  async call(endpoint: string, body: any) {
    this.calls++;
    const graph = fixture("graph"),
      pages = body.pages ?? [];
    switch (endpoint) {
      case "/v1/video/text":
        return {
          pages: fixture("pages").pages.map(({ resourceId, ...p }: any) => p),
          approximateTimestamps: false,
        };
      case "/v1/glossary":
        return fixture("glossary");
      case "/v1/transcribe": {
        const words = fixture("lecture").words;
        return { words, text: words.map((w: any) => w.w).join(" ") };
      }
      case "/v1/flag": {
        const l = fixture("lecture");
        const autoFixed = l.flags.flatMap((f: any) => {
          const learned = body.corrections?.find(
            (c: any) =>
              c.heard.toLowerCase() === f.heard.toLowerCase() && c.count >= 2,
          );
          return learned
            ? [{ startIdx: f.startIdx, endIdx: f.endIdx, to: learned.correct }]
            : [];
        });
        return {
          flags: l.flags.filter(
            (f: any) => !autoFixed.some((a: any) => a.startIdx === f.startIdx),
          ),
          autoFixed,
        };
      }
      case "/v1/concepts/extract":
        return {
          concepts: graph.nodes
            .map((c: any) => ({
              name: c.name,
              definition: c.definition,
              evidence: c.evidence.map((e: any) => ({
                ...e,
                resourceId:
                  pages.find(
                    (p: any) =>
                      p.n === e.page &&
                      p.text.toLowerCase().includes(e.quote.toLowerCase()),
                  )?.resourceId ?? e.resourceId,
              })),
            }))
            .filter((c: any) =>
              c.evidence.every((e: any) => verified(e, pages)),
            ),
          dropped: 0,
        };
      case "/v1/embed":
        return {
          vectors: body.texts.map((_: string, i: number) =>
            Array.from({ length: 768 }, (_, j) => (j === i % 768 ? 1 : 0)),
          ),
        };
      case "/v1/edges/type":
        return {
          edges: body.pairs.map(({ a, b }: any) => {
            const source = graph.edges.find(
              (e: any) =>
                (e.from === a.id && e.to === b.id) ||
                (e.from === b.id && e.to === a.id),
            );
            return source ?? null;
          }),
        };
      case "/v1/questions/generate":
        return {
          questions: fixture("questions")
            .questions.filter(
              (q: any) =>
                q.conceptIds.includes(body.concept.id) &&
                q.kind === body.kind &&
                q.citations.every((e: any) => verified(e, pages)),
            )
            .slice(0, body.n),
          dropped: 0,
        };
      case "/v1/answer":
        return /chain|gradient|backprop/i.test(
          body.question ?? body.kind ?? "",
        ) && pages.length
          ? {
              answer: pages[0].text,
              citations: [
                {
                  resourceId: pages[0].resourceId,
                  page: pages[0].n,
                  quote: pages[0].text,
                },
              ],
            }
          : { refused: true, reason: "not_in_materials" };
      case "/v1/papers/tag":
        return {
          questions: pages.map((p: any) => ({
            text: p.text,
            concepts: body.concepts.filter((n: string) =>
              p.text.toLowerCase().includes(n.toLowerCase()),
            ),
          })),
        };
      default:
        throw new ApiError("internal", `Unknown fake endpoint ${endpoint}`);
    }
  }
}
