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

it("accepts dual-stack public hosts while rejecting mixed private IPv4 and IPv6-only hosts", async () => {
  const resolve = (rows: { address: string; family: number }[]) =>
    (async () => rows) as unknown as typeof import("node:dns/promises").lookup;
  await expect(
    safeUrl(
      "https://example.com/page",
      resolve([
        { address: "93.184.215.14", family: 4 },
        { address: "2606:2800:220:1::1", family: 6 },
      ]),
    ),
  ).resolves.toMatchObject({ hostname: "example.com" });
  await expect(
    safeUrl(
      "https://example.com",
      resolve([
        { address: "93.184.215.14", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ]),
    ),
  ).rejects.toMatchObject({ code: "bad_request" });
  await expect(
    safeUrl(
      "https://example.com",
      resolve([{ address: "2606:2800:220:1::1", family: 6 }]),
    ),
  ).rejects.toMatchObject({ code: "bad_request" });
  await expect(safeUrl("https://[::1]")).rejects.toMatchObject({
    code: "bad_request",
  });
  await expect(safeUrl("http://100.64.1.1")).rejects.toMatchObject({
    code: "bad_request",
  });
});
