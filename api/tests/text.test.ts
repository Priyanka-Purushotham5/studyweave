import { it, expect } from "vitest";
import {
  sanitizeText,
  sanitizeCapturedValue,
  MAX_PAGE_CHARACTERS,
} from "../src/services/text.js";
it("strips control, zero-width, BOM and directional format characters", () => {
  expect(
    sanitizeText("a\0\x01\x7f\x85\u200b\u200c\u200d\u2060\ufeff\u202eb"),
  ).toBe("ab");
});
it("normalizes line controls to spaces and preserves readable Unicode", () => {
  expect(sanitizeText("café\tα\r\nβ")).toBe("café α  β");
});
it("caps after stripping and avoids splitting surrogate pairs", () => {
  expect(
    sanitizeText("\u200b".repeat(10) + "x".repeat(MAX_PAGE_CHARACTERS + 1)),
  ).toHaveLength(MAX_PAGE_CHARACTERS);
  expect(sanitizeText("ab😀", 3)).toBe("ab");
});
it("sanitizes nested cached AI responses without mutating the original", () => {
  const source = {
    pages: [{ n: 1, text: "a\u200bb" + "x".repeat(MAX_PAGE_CHARACTERS) }],
  };
  const result = sanitizeCapturedValue(source);
  expect(result.pages[0].n).toBe(1);
  expect(result.pages[0].text).toHaveLength(MAX_PAGE_CHARACTERS);
  expect(result.pages[0].text).not.toContain("\u200b");
  expect(source.pages[0].text).toContain("\u200b");
});
