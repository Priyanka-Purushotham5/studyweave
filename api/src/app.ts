import express from "express";
import { responseValidation } from "./contracts/validation.js";
import helmet from "helmet";
import cors from "cors";
import { routes } from "./routes/index.js";
import { ApiError } from "./services/errors.js";
import { Store } from "./db/store.js";
import { CachedAiClient, type AiClient } from "./ai/aiClient.js";
import { Jobs } from "./services/jobs.js";
import {
  CosineNeighborFinder,
  type NeighborFinder,
} from "./services/neighbors.js";
export function createApp(
  store: Store,
  client: AiClient,
  options: {
    enableSeed?: boolean;
    publicDemo?: boolean;
    teamMode?: boolean;
    teamOrigin?: string;
    origin?: string;
    finder?: NeighborFinder;
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  if (options.origin) app.use(cors({ origin: options.origin }));
  if (options.publicDemo) {
    let windowStarted = Date.now();
    let interactions = 0;
    app.use((req, res, next) => {
      const allowed =
        (req.method === "GET" &&
          ["/healthz", "/readyz", "/api/tree", "/api/graph"].includes(
            req.path,
          )) ||
        (req.method === "POST" &&
          ["/api/questions/next", "/api/attempts"].includes(req.path));
      if (!allowed)
        return res
          .status(404)
          .json({ error: { code: "not_found", message: "Route not found" } });
      if (req.method === "POST") {
        if (Date.now() - windowStarted >= 60_000) {
          windowStarted = Date.now();
          interactions = 0;
        }
        if (++interactions > 60)
          return res.status(429).json({
            error: { code: "rate_limited", message: "Too many requests" },
          });
      }
      next();
    });
  }
  if (options.teamMode && !options.publicDemo) {
    let windowStarted = Date.now();
    let interactions = 0;
    app.use((req, res, next) => {
      if (
        !["POST", "DELETE"].includes(req.method) ||
        !req.path.startsWith("/api/")
      )
        return next();
      const origin = req.get("origin");
      if (origin && origin !== options.teamOrigin)
        return res.status(403).json({
          error: { code: "forbidden", message: "Origin not allowed" },
        });
      if (Date.now() - windowStarted >= 60_000) {
        windowStarted = Date.now();
        interactions = 0;
      }
      if (++interactions > 180)
        return res.status(429).json({
          error: { code: "rate_limited", message: "Too many requests" },
        });
      next();
    });
  }
  app.use(responseValidation);
  app.use(express.json({ limit: options.publicDemo ? "16kb" : "3mb" }));
  const jobs = new Jobs(store);
  const ai = new CachedAiClient(client, store);
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.get("/readyz", (_req, res, next) => {
    store.db
      .command({ ping: 1 })
      .then(() => res.json({ ok: true }))
      .catch(next);
  });
  app.use(
    "/api",
    routes(
      store,
      ai,
      jobs,
      options.finder ?? new CosineNeighborFinder(),
      options.enableSeed && !options.publicDemo,
      options.publicDemo,
    ),
  );
  app.use((_req, _res, next) =>
    next(new ApiError("not_found", "Route not found")),
  );
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const e =
        err instanceof ApiError
          ? err
          : err.type === "entity.parse.failed"
            ? new ApiError("bad_request", "Malformed JSON")
            : err instanceof SyntaxError || err.name === "MulterError"
              ? new ApiError("bad_request", err.message)
              : new ApiError("internal", "An unexpected error occurred");
      if (e.code === "internal") console.error(err);
      res
        .status(e.status)
        .json({ error: { code: e.code, message: e.message } });
    },
  );
  return { app, jobs };
}
