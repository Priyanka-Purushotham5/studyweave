import { sanitizeText, MAX_CAPTURE_CHARACTERS } from "./text.js";
import { validateDocument } from "./uploads.js";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { lookup } from "node:dns/promises";
import * as cheerio from "cheerio";
import { Store } from "../db/store.js";
import { hash, type AiClient } from "../ai/aiClient.js";
import { Jobs } from "./jobs.js";
import { weights } from "./pipeline.js";
import { ApiError, requireValue } from "./errors.js";
export function splitPages(text: string) {
  text = sanitizeText(text, MAX_CAPTURE_CHARACTERS);
  const result = [];
  for (let i = 0; i < text.length; i += 2000)
    result.push({ n: result.length + 1, text: text.slice(i, i + 2000) });
  return result;
}
export async function safeUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError("bad_request", "Invalid URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new ApiError("bad_request", "Only public HTTP URLs are supported");
  const ips = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true });
  if (
    !ips.length ||
    ips.some(
      ({ address: a }) =>
        !isIP(a) ||
        a.includes(":") ||
        /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|224\.|255\.)/.test(
          a,
        ),
    )
  )
    throw new ApiError("bad_request", "Private network URLs are not supported");
  return url;
}
export async function fetchText(value: string) {
  const url = await safeUrl(value);
  // Pin the validated DNS result to the socket to prevent DNS rebinding.
  const resolved = await lookup(url.hostname, { all: true });
  const address = resolved.find(
    ({ address }) =>
      isIP(address) === 4 &&
      !/^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|22[4-9]\.|2[3-5]\d\.)/.test(
        address,
      ),
  )?.address;
  if (!address)
    throw new ApiError("bad_request", "No public IPv4 address found");
  const data = await new Promise<string>((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        lookup: ((_hostname: any, _options: any, callback: any) =>
          callback(null, address, 4)) as any,
        headers: {
          "user-agent": "StudyWeave/3.0",
          accept: "text/html,text/plain",
        },
      },
      (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(
            new Error(
              "Webpage could not be fetched (redirects are not followed)",
            ),
          );
          return;
        }
        if (!/text\/(html|plain)/.test(res.headers["content-type"] ?? "")) {
          res.resume();
          reject(new Error("Only HTML and plain text are supported"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2_000_000) {
            request.destroy(new Error("Webpage is too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      },
    );
    request.setTimeout(10000, () =>
      request.destroy(new Error("Webpage request timed out")),
    );
    request.on("error", reject);
    request.end();
  });
  const $ = cheerio.load(data);
  $("script,style,nav,noscript").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}
export class Resources {
  constructor(
    private s: Store,
    private ai: AiClient,
    private jobs: Jobs,
    private web = fetchText,
  ) {}
  async save(body: any, file?: { buffer: Buffer; originalname: string }) {
    if (file) await validateDocument(file.buffer, file.originalname);
    body = {
      ...body,
      ...(typeof body.text === "string"
        ? { text: sanitizeText(body.text, MAX_CAPTURE_CHARACTERS) }
        : {}),
      ...(typeof body.title === "string"
        ? { title: sanitizeText(body.title, 2000) }
        : {}),
    };
    requireValue(
      await this.s.get("modules", body.moduleId),
      "Module not found",
    );
    if (body.url) await safeUrl(body.url);
    const digest = hash(
      file
        ? file.buffer.toString("base64")
        : { type: body.type, url: body.url, text: body.text ?? "" },
    );
    const existing = (
      await this.s.all("resources", { moduleId: body.moduleId, hash: digest })
    )[0];
    if (existing && existing.extractionStatus !== "unsupported")
      return existing;
    const id = existing?.id ?? randomUUID();
    const fileId =
      existing?.fileId ??
      (file
        ? await this.s.saveFile(
            file.buffer,
            file.originalname,
            file.originalname.toLowerCase().endsWith(".pptx")
              ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
              : "application/pdf",
          )
        : undefined);
    const newlyStoredFile = !!fileId && !existing?.fileId;
    const row = {
      ...(fileId ? { fileId, url: `/api/resources/${id}/file` } : {}),
      id,
      ...body,
      type: file
        ? file.originalname.toLowerCase().endsWith(".pptx")
          ? "pptx"
          : "pdf"
        : body.type,
      title: sanitizeText(body.title ?? file?.originalname ?? body.url, 2000),
      hash: digest,
      pages: [],
      extractionStatus: "pending",
    };
    delete row.text;
    try {
      await this.s.put("resources", row);
    } catch (e: any) {
      if (e.code === 11000) {
        if (newlyStoredFile) await this.s.deleteFile(fileId);
        return (
          await this.s.all("resources", {
            moduleId: body.moduleId,
            hash: digest,
          })
        )[0];
      }
      if (newlyStoredFile) await this.s.deleteFile(fileId);
      throw e;
    }
    await this.jobs.enqueue(
      "extract",
      async () => {
        try {
          const result = file
            ? await this.ai.upload("/v1/parse", file.buffer, file.originalname)
            : body.type === "youtube"
              ? await this.ai.call("/v1/video/text", { url: body.url })
              : { pages: splitPages(body.text ?? (await this.web(body.url))) };
          if (
            !Array.isArray(result.pages) ||
            !result.pages.length ||
            result.pages.some(
              (p: any) => !Number.isInteger(p.n) || typeof p.text !== "string",
            )
          )
            throw new Error("No supported text could be extracted");
          await this.s.put("resources", {
            ...row,
            pages: result.pages.map((p: any) => ({
              ...p,
              text: sanitizeText(p.text),
              resourceId: id,
            })),
            extractionStatus: "done",
          });
          if (["past_paper", "model_paper"].includes(body.tag))
            await this.jobs.enqueue("paper-weights", () =>
              weights(this.s, this.ai, body.moduleId),
            );
        } catch (e) {
          await this.s.put("resources", {
            ...row,
            extractionStatus: "unsupported",
            extractionError:
              e instanceof Error ? e.message : "Extraction failed",
          });
          throw e;
        }
      },
      id,
    );
    return row;
  }
}
