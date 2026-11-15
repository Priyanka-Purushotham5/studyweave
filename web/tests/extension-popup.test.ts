import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); document.body.innerHTML = ""; });

it.each([true, false])("saves the %s suggestion selection", async accept => {
  document.body.innerHTML = readFileSync("../extension/popup.html", "utf8");
  const tree = { subjects: [{ id: "s", name: "Course", exams: [{ id: "e", name: "Exam", modules: [
    { id: "other", name: "Other" }, { id: "suggested", name: "Backpropagation" },
  ] }] }] };
  const sendMessage = vi.fn(async (message: { action: string }) => message.action === "tree" ? { result: tree } : { result: { id: "saved" } });
  vi.stubGlobal("chrome", {
    tabs: { query: async () => [{ id: 1, url: "https://example.com/backpropagation", title: "Backpropagation notes" }] },
    storage: { local: { get: async () => ({}) } }, runtime: { sendMessage },
  });
  await import("../../extension/popup.js");
  const suggestion = document.getElementById("suggestion") as HTMLButtonElement;
  await waitFor(() => expect(suggestion.hidden).toBe(false));
  fireEvent.click(suggestion);
  const module = document.getElementById("module") as HTMLSelectElement;
  expect(module.value).toBe("suggested");
  if (!accept) fireEvent.change(module, { target: { value: "other" } });
  fireEvent.submit(document.getElementById("capture")!);
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: "save", moduleId: accept ? "suggested" : "other" })));
});
