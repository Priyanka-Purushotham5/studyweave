import AjvModule from "ajv";
import { responses } from "./schemas.js";
import { ApiError } from "../services/errors.js";
import type { Request, Response, NextFunction } from "express";
const Ajv = AjvModule as unknown as typeof AjvModule.default;
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
export const responseValidators = Object.fromEntries(
  Object.entries(responses).map(([k, s]) => [k, ajv.compile(s)]),
);
export function responseValidation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const original = res.json.bind(res);
  res.json = (body: any) => {
    let key: string | undefined;
    if (res.statusCode >= 400) key = "error";
    else if (
      req.path === "/healthz" ||
      req.path === "/readyz" ||
      req.path === "/api/dev/seed"
    )
      key = "health";
    else if (req.path === "/api/tree") key = "tree";
    else if (req.path === "/api/graph") key = "graph";
    else if (req.path === "/api/questions/next") key = "questions";
    else if (req.path === "/api/attempts") key = "attempt";
    else if (req.path === "/api/ask") key = "ask";
    else if (req.path === "/api/revision-plan") key = "revisionPlan";
    else if (req.path === "/api/revision-path") key = "revisionPath";
    else if (/^\/api\/(subjects|exams|modules)$/.test(req.path))
      key = "created";
    else if (req.path.startsWith("/api/resources")) key = "resource";
    else if (req.path.endsWith("/build")) key = "jobId";
    else if (req.path.startsWith("/api/jobs/")) key = "job";
    else if (req.path.endsWith("/corrections")) key = "correction";
    else if (req.path === "/api/lectures") key = "lectureId";
    else if (req.path.startsWith("/api/lectures/")) key = "lecture";
    if (key && !responseValidators[key](body)) {
      console.error(
        `Response contract failed: ${key}`,
        ajv.errorsText(responseValidators[key].errors),
      );
      throw new ApiError("internal", "Response failed contract validation");
    }
    return original(body);
  };
  next();
}
