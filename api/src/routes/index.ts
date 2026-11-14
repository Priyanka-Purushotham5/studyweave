import { MAX_UPLOAD_BYTES } from "../services/uploads.js";
import express from "express";
import { streamFile } from "../services/files.js";
import multer from "multer";
import { randomUUID } from "node:crypto";
import AjvModule from "ajv";
import { schemas } from "../contracts/schemas.js";
import { Store } from "../db/store.js";
import type { AiClient } from "../ai/aiClient.js";
import { ApiError, requireValue } from "../services/errors.js";
import { tree, seed } from "../services/seed.js";
import { Resources } from "../services/resources.js";
import { Lectures } from "../services/lectures.js";
import { Jobs } from "../services/jobs.js";
import { build } from "../services/pipeline.js";
import { Study } from "../services/study.js";
import type { NeighborFinder } from "../services/neighbors.js";
import type { Concept, Attempt, Edge, Question } from "../contracts/types.js";
const Ajv = AjvModule as unknown as typeof AjvModule.default;
export function routes(
  s: Store,
  ai: AiClient,
  jobs: Jobs,
  finder: NeighborFinder,
  enableSeed = false,
) {
  const r = express.Router();
  const ajv = new Ajv({ allErrors: true });
  const valid = Object.fromEntries(
    Object.entries(schemas).map(([k, v]) => [k, ajv.compile(v)]),
  );
  const validate = (name: string) => (req: any, _res: any, next: any) =>
    valid[name](req.body)
      ? next()
      : next(
          new ApiError(
            "bad_request",
            `Invalid ${name} request: ${ajv.errorsText(valid[name].errors)}`,
          ),
        );
  const handle = (fn: any) => (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res)).catch(next);
  const resources = new Resources(s, ai, jobs),
    lectures = new Lectures(s, ai, jobs);
  const study = new Study(s, ai);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1, fields: 8 },
  });
  r.get(
    "/tree",
    handle(async (_q: any, res: any) =>
      res.json(
        tree(
          ...((await Promise.all(
            ["subjects", "exams", "modules", "resources"].map((n) => s.all(n)),
          )) as [any[], any[], any[], any[]]),
        ),
      ),
    ),
  );
  for (const [path, schema, parent] of [
    ["subjects", "subject", null],
    ["exams", "exam", "subjects"],
    ["modules", "module", "exams"],
  ] as const)
    r.post(
      "/" + path,
      validate(schema),
      handle(async (req: any, res: any) => {
        if (parent)
          requireValue(
            await s.get(
              parent,
              req.body[parent === "subjects" ? "subjectId" : "examId"],
            ),
            "Parent not found",
          );
        res
          .status(201)
          .json(await s.put(path, { id: randomUUID(), ...req.body }));
      }),
    );
  r.get(
    "/resources/:id/file",
    handle(async (req: any, res: any) => {
      const row = requireValue(
        await s.get("resources", req.params.id),
        "Resource not found",
      );
      requireValue(row.fileId, "Source file not found");
      await streamFile(s, row.fileId, req, res);
    }),
  );
  r.get(
    "/lectures/:id/audio",
    handle(async (req: any, res: any) => {
      const row = requireValue(
        await s.get("lectures", req.params.id),
        "Lecture not found",
      );
      requireValue(row.audioFileId, "Audio file not found");
      await streamFile(s, row.audioFileId, req, res);
    }),
  );
  r.post(
    "/resources",
    validate("resource"),
    handle(async (req: any, res: any) =>
      res.status(201).json(await resources.save(req.body)),
    ),
  );
  r.post(
    "/resources/upload",
    upload.single("file"),
    handle(async (req: any, res: any) => {
      if (
        !req.file ||
        !req.body.moduleId ||
        !["lecture", "notes", "past_paper", "model_paper"].includes(
          req.body.tag,
        ) ||
        !/\.(pdf|pptx)$/i.test(req.file.originalname)
      )
        throw new ApiError(
          "bad_request",
          "Provide a PDF or PPTX, moduleId and valid tag",
        );
      res
        .status(201)
        .json(
          await resources.save(
            { moduleId: req.body.moduleId, tag: req.body.tag },
            req.file,
          ),
        );
    }),
  );
  r.post(
    "/modules/:id/build",
    handle(async (req: any, res: any) => {
      requireValue(await s.get("modules", req.params.id), "Module not found");
      res.status(202).json({
        jobId: await jobs.enqueue("build", () =>
          build(s, ai, finder, req.params.id),
        ),
      });
    }),
  );
  r.get(
    "/jobs/:id",
    handle(async (req: any, res: any) =>
      res.json(
        requireValue(await s.get("jobs", req.params.id), "Job not found"),
      ),
    ),
  );
  r.get(
    "/graph",
    handle(async (req: any, res: any) => {
      res.json(
        await study.graph(
          typeof req.query.subjectId === "string"
            ? req.query.subjectId
            : undefined,
        ),
      );
    }),
  );
  r.post(
    "/questions/next",
    validate("questions"),
    handle(async (req: any, res: any) => {
      res.json(await study.next(req.body));
    }),
  );
  r.post(
    "/attempts",
    validate("attempt"),
    handle(async (req: any, res: any) => {
      res.json(await study.attempt(req.body));
    }),
  );
  r.post(
    "/ask",
    validate("ask"),
    handle(async (req: any, res: any) => {
      res.json(await study.ask(req.body));
    }),
  );
  r.get(
    "/revision-plan",
    handle(async (req: any, res: any) => {
      res.json(await study.plan(req.query.examId, req.query.minutesPerDay));
    }),
  );
  r.get(
    "/revision-path",
    handle(async (req: any, res: any) => {
      res.json(await study.path(req.query.conceptId));
    }),
  );
  r.post(
    "/lectures",
    upload.single("audio"),
    handle(async (req: any, res: any) => {
      if (
        !req.file ||
        typeof req.body.moduleId !== "string" ||
        typeof req.body.slidesResourceId !== "string"
      )
        throw new ApiError(
          "bad_request",
          "audio, moduleId and slidesResourceId required",
        );
      res
        .status(202)
        .json(
          await lectures.create(
            req.body.moduleId,
            req.body.slidesResourceId,
            req.file.buffer,
            req.file.originalname,
          ),
        );
    }),
  );
  r.get(
    "/lectures/:id",
    handle(async (req: any, res: any) =>
      res.json(
        requireValue(
          await s.get("lectures", req.params.id),
          "Lecture not found",
        ),
      ),
    ),
  );
  r.post(
    "/lectures/:id/corrections",
    validate("correction"),
    handle(async (req: any, res: any) =>
      res.json(await lectures.correct(req.params.id, req.body)),
    ),
  );
  if (enableSeed)
    r.post(
      "/dev/seed",
      handle(async (_q: any, res: any) => res.json(await seed(s))),
    );
  return r;
}
