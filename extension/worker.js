import { capturePayload, defaultServer, retryNetwork, serverAddress } from "./capture.js";

async function call(path, body) {
  const { server = defaultServer } = await chrome.storage.local.get("server");
  const url = new URL(path, serverAddress(server));
  const response = await retryNetwork(() => fetch(url, {
    ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    credentials: "include",
    signal: AbortSignal.timeout(9000),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message ?? `StudyWeave returned HTTP ${response.status}.`);
  }
  return response.json();
}

async function handle(message) {
  if (message.action === "tree") return call("/api/tree");
  if (message.action !== "save") throw new Error("Unknown capture action.");
  const { moduleId, subjectId, examId, tabId } = message;
  const tab = await chrome.tabs.get(tabId);
  const initialUrl = tab.url;
  if (!initialUrl || !/^https?:\/\//i.test(initialUrl)) throw new Error("Open a web page or a YouTube video first.");
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      url: location.href,
      title: document.title,
      text: (document.querySelector("article, main, [role='main']") ?? document.body)?.innerText.trim().slice(0, 60_000) ?? "",
    }),
  }).catch(() => []);
  if (injection?.result && injection.result.url !== initialUrl) throw new Error("The tab changed. Reopen StudyWeave Capture and try again.");
  const page = injection?.result ?? { url: initialUrl, title: tab.title, text: "" };
  const resource = await call("/api/resources", capturePayload(moduleId, page));
  await chrome.storage.local.set({ lastSelection: { subjectId, examId, moduleId } });
  return resource;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  handle(message).then(result => respond({ result }), error => respond({ error: error.message }));
  return true;
});
