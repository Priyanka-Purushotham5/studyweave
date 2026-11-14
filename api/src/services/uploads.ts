import yauzl from "yauzl";
import { ApiError } from "./errors.js";
export const MAX_UPLOAD_BYTES = 20_000_000;
const invalid = () =>
  new ApiError(
    "bad_request",
    "Upload must be a PDF or PPTX with a matching file signature",
  );
export function validateUploadSize(data: Buffer) {
  if (data.length > MAX_UPLOAD_BYTES)
    throw new ApiError("bad_request", "Upload exceeds the 20 MB limit");
}
/** Inspect ZIP metadata lazily, and read only the bounded PPTX content-type manifest. */
export async function validateDocument(
  data: Buffer,
  filename: string,
): Promise<"pdf" | "pptx"> {
  validateUploadSize(data);
  if (/\.pdf$/i.test(filename)) {
    if (!/^%PDF-\d\.\d(?:\s|$)/.test(data.subarray(0, 16).toString("latin1")))
      throw invalid();
    return "pdf";
  }
  if (
    !/\.pptx$/i.test(filename) ||
    !data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  )
    throw invalid();
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(
      data,
      { lazyEntries: true, autoClose: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) {
          reject(invalid());
          return;
        }
        let entries = 0,
          total = 0,
          presentation = false,
          manifest = false,
          finished = false;
        const fail = () => {
          if (!finished) {
            finished = true;
            zip.close();
            reject(invalid());
          }
        };
        zip.on("error", fail);
        zip.on("entry", (entry: yauzl.Entry) => {
          entries++;
          total += entry.uncompressedSize;
          if (
            entries > 10000 ||
            total > 100_000_000 ||
            (entry.generalPurposeBitFlag & 1) !== 0
          ) {
            fail();
            return;
          }
          if (
            entry.fileName === "ppt/presentation.xml" &&
            entry.uncompressedSize > 0
          )
            presentation = true;
          if (entry.fileName !== "[Content_Types].xml") {
            zip.readEntry();
            return;
          }
          if (manifest || entry.uncompressedSize > 128_000) {
            fail();
            return;
          }
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) {
              fail();
              return;
            }
            let size = 0;
            const chunks: Buffer[] = [];
            stream.on("error", fail);
            stream.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > 128_000) {
                stream.destroy();
                fail();
                return;
              }
              chunks.push(chunk);
            });
            stream.on("end", () => {
              if (finished) return;
              manifest = Buffer.concat(chunks)
                .toString("utf8")
                .includes(
                  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
                );
              zip.readEntry();
            });
          });
        });
        zip.on("end", () => {
          if (finished) return;
          finished = true;
          if (presentation && manifest) resolve();
          else reject(invalid());
        });
        zip.readEntry();
      },
    );
  });
  return "pptx";
}
