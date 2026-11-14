import { it, expect } from "vitest";
import { ZipFile } from "yazl";
import {
  validateDocument,
  validateUploadSize,
  MAX_UPLOAD_BYTES,
} from "../src/services/uploads.js";
async function archive(entries: Record<string, string>) {
  const zip = new ZipFile();
  for (const [name, text] of Object.entries(entries))
    zip.addBuffer(Buffer.from(text), name);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on("data", (c) => chunks.push(c));
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on("error", reject);
  });
  zip.end();
  return done;
}
const manifest =
  '<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>';
it("accepts PDF signature with matching extension, including uppercase", async () => {
  await expect(
    validateDocument(Buffer.from("%PDF-1.7\nbody"), "SLIDES.PDF"),
  ).resolves.toBe("pdf");
});
it.each([
  ["<html>fake</html>", "x.pdf"],
  ["%PDF-1.7\nbody", "x.exe"],
  ["%PDF-1.7\nbody", "x.pptx"],
  ["PK\u0003\u0004fake", "x.pptx"],
  ["", "x.pdf"],
])("rejects forged or unsupported upload %j %s", async (content, name) => {
  await expect(
    validateDocument(Buffer.from(content), name),
  ).rejects.toMatchObject({ code: "bad_request" });
});
it("accepts a real PPTX ZIP container with a presentation manifest", async () => {
  const zip = await archive({
    "[Content_Types].xml": manifest,
    "ppt/presentation.xml": "<p:presentation/>",
  });
  await expect(validateDocument(zip, "deck.pptx")).resolves.toBe("pptx");
});
it("rejects generic ZIP and renamed Word archives", async () => {
  for (const entries of [
    { "hello.txt": "x" },
    {
      "[Content_Types].xml":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
      "word/document.xml": "x",
    },
    { "[Content_Types].xml": manifest },
  ])
    await expect(
      validateDocument(await archive(entries), "deck.pptx"),
    ).rejects.toMatchObject({ code: "bad_request" });
});
it("rejects an oversized decompressed manifest without expanding it", async () => {
  await expect(
    validateDocument(
      await archive({
        "[Content_Types].xml": "x".repeat(128001),
        "ppt/presentation.xml": "x",
      }),
      "deck.pptx",
    ),
  ).rejects.toMatchObject({ code: "bad_request" });
});
it("enforces exact 20 MB boundary in the shared service guard", () => {
  expect(() =>
    validateUploadSize(Buffer.alloc(MAX_UPLOAD_BYTES)),
  ).not.toThrow();
  expect(() => validateUploadSize(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).toThrow(
    "20 MB",
  );
});
