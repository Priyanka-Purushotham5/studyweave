export const statuses = {
  bad_request: 400,
  scanned_pdf: 422,
  not_found: 404,
  rate_limited: 429,
  ai_unavailable: 503,
  internal: 500,
} as const;
export class ApiError extends Error {
  constructor(
    public code: keyof typeof statuses,
    message: string,
    public status: number = statuses[code],
  ) {
    super(message);
  }
}
export function requireValue<T>(v: T, message = "Not found"): NonNullable<T> {
  if (v == null) throw new ApiError("not_found", message);
  return v as NonNullable<T>;
}
