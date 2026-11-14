import type { Request, Response } from "express";
import { Store } from "../db/store.js";
import { ApiError, requireValue } from "./errors.js";
/** GridFS range streaming supports lecture seeking without loading the audio into RAM. */
export async function streamFile(
  s: Store,
  id: string,
  req: Request,
  res: Response,
) {
  const info = requireValue(await s.fileInfo(id), "Source file not found");
  const length = info.length;
  let start = 0,
    end = length - 1;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match)
      throw new ApiError(
        "bad_request",
        "Only a single byte range is supported",
        416,
      );
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : length - 1;
    if (start > end || start >= length || end >= length) {
      res.setHeader("Content-Range", `bytes */${length}`);
      throw new ApiError(
        "bad_request",
        "Requested byte range is outside the file",
        416,
      );
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${length}`);
  }
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Length", end - start + 1);
  res.setHeader(
    "Content-Type",
    info.metadata?.contentType ?? "application/octet-stream",
  );
  res.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(info.filename)}`,
  );
  const stream = s.fileStream(id, start, end + 1);
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}
