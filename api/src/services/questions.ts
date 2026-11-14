import type { Question, Page } from "../contracts/types.js";
import { sharedValidator } from "../contracts/shared.js";
import { verified } from "./citations.js";
/** Enforce prose semantics as well as the shared schema, on writes and reads. */
export function servableQuestion(value: any, pages: Page[]): value is Question {
  if (
    !sharedValidator("Question")(value) ||
    !value.conceptIds.length ||
    !value.citations.every((e: any) => verified(e, pages))
  )
    return false;
  return ["mcq", "past_paper"].includes(value.kind)
    ? value.options.length === 4 && ["A", "B", "C", "D"].includes(value.answer)
    : value.options.length === 0;
}
