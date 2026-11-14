import { it, expect } from "vitest";
import { splitPages, safeUrl } from "../src/services/resources.js";
it("web text is split into numbered pseudo-pages without data loss", () => {
  const text = "a".repeat(4500),
    pages = splitPages(text);
  expect(pages.map((p) => p.text.length)).toEqual([2000, 2000, 500]);
  expect(pages.map((p) => p.text).join("")).toBe(text);
  expect(pages.map((p) => p.n)).toEqual([1, 2, 3]);
});
it.each([
  "http://127.0.0.1",
  "http://10.0.0.1",
  "http://169.254.169.254",
  "http://192.168.1.1",
  "file:///etc/passwd",
  "http://u:p@example.com",
])("rejects unsafe capture %s", async (url) => {
  await expect(safeUrl(url)).rejects.toMatchObject({ code: "bad_request" });
});
