import { capturePayload, defaultServer, retryNetwork, serverAddress } from "./capture.js";

async function call(path, body) {
  const { server = defaultServer } = await chrome.storage.local.get("server");
  const origin = serverAddress(server).origin;
  if (!["/api/tree", "/api/resources"].includes(path)) throw new Error("Unsupported API request.");
  const tabs = await chrome.tabs.query({ url: `${origin}/*` });
  const appTab = tabs.find(tab => {
    try { return tab.id && tab.status === "complete" && new URL(tab.url).origin === origin; }
    catch { return false; }
  });
  if (!appTab) throw new Error("Open and sign in to StudyNova, then return to this page and try again.");
  let execution;
  try {
    execution = await retryNetwork(() => chrome.scripting.executeScript({
      target: { tabId: appTab.id },
      world: "MAIN",
      args: [origin, path, body ?? null],
      func: async (expectedOrigin, apiPath, payload) => {
        if (location.origin !== expectedOrigin || !["/api/tree", "/api/resources"].includes(apiPath))
          return { status: 0, error: "StudyNova tab changed. Please try again." };
        try {
          const response = await fetch(apiPath, {
            ...(payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}),
            credentials: "same-origin",
            redirect: "error",
            signal: AbortSignal.timeout(9000),
          });
          return { status: response.status, data: await response.json().catch(() => null) };
        } catch { return { status: 0, error: "Could not reach StudyNova. Check your connection and try again." }; }
      },
    }));
  } catch {
    throw new Error("Open and sign in to StudyNova, then return to this page and try again.");
  }
  const result = execution?.[0]?.result;
  if (!result || result.status === 401)
    throw new Error("Open and sign in to StudyNova, then return to this page and try again.");
  if (result.status === 403)
    throw new Error("StudyNova rejected this request. Check the server origin and try again.");
  if (result.status < 200 || result.status >= 300)
    throw new Error(result.error ?? result.data?.error?.message ?? `StudyNova returned HTTP ${result.status}.`);
  if (path === "/api/tree" && !Array.isArray(result.data?.subjects))
    throw new Error("This server did not return a StudyWeave course list.");
  return result.data;
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
