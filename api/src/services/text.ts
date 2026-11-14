/** Limits apply after removing invisible/control characters, before persistence or AI use. */
export const MAX_PAGE_CHARACTERS = 20_000;
export const MAX_CAPTURE_CHARACTERS = 2_000_000;
export function sanitizeText(
  value: string,
  limit = MAX_PAGE_CHARACTERS,
): string {
  const clean = value.replace(/[\t\r\n]/g, " ").replace(/[\p{Cc}\p{Cf}]/gu, "");
  const capped = clean.slice(0, limit);
  // Never leave half of a UTF-16 surrogate pair at the boundary.
  return /[\uD800-\uDBFF]$/.test(capped) ? capped.slice(0, -1) : capped;
}

/** Apply the same policy to AI responses before the persistent cache sees them. */
export function sanitizeCapturedValue<T>(value: T): T {
  if (typeof value === "string") return sanitizeText(value) as T;
  if (Array.isArray(value)) return value.map(sanitizeCapturedValue) as T;
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeCapturedValue(item),
      ]),
    ) as T;
  return value;
}
