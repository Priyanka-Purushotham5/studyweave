import { capturePayload, defaultServer, retryNetwork, serverAddress } from "./capture.js";

async function call(origin, path, body, authorization) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (authorization) headers.Authorization = authorization;
  const response = await retryNetwork(() => fetch(new URL(path, origin), {
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    headers,
    credentials: authorization ? "omit" : "include",
    redirect: authorization ? "error" : "follow",
    signal: AbortSignal.timeout(9000),
  }));
  if (response.status === 401) {
    const message = authorization
      ? "StudyWeave rejected the username or password. Check your deployment login."
      : "Sign in with your StudyWeave username and password under API connection.";
    throw Object.assign(new Error(message), { status: 401 });
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message ?? `StudyWeave returned HTTP ${response.status}.`);
  }
  return response.json();
}

async function connect({ server, username, password }) {
  const { origin, protocol } = serverAddress(server);
  let authorization;
  if (username || password) {
    if (protocol !== "https:") throw new Error("Use an HTTPS API URL to sign in.");
    if (!username || !password || username.includes(":")) {
      throw new Error("Enter a username without a colon and your password.");
    }
    const bytes = new TextEncoder().encode(`${username}:${password}`);
    authorization = "Basic " + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
  }
  const tree = await call(origin, "/api/tree", undefined, authorization);
  if (!Array.isArray(tree?.subjects)) throw new Error("This server did not return a StudyWeave course list.");
  if (authorization) await chrome.storage.session.set({ login: { origin, authorization } });
  else await chrome.storage.session.remove("login");
  await chrome.storage.local.set({ server: origin });
  return tree;
}

async function handle(message) {
  if (message.action === "connect") return connect(message);
  const { server = defaultServer } = await chrome.storage.local.get("server");
  const { origin, protocol } = serverAddress(server);
  const { login } = await chrome.storage.session.get("login");
  const authorization = protocol === "https:" && login?.origin === origin ? login.authorization : undefined;
  if (message.action === "tree") return call(origin, "/api/tree", undefined, authorization);
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
  const resource = await call(origin, "/api/resources", capturePayload(moduleId, page), authorization);
  await chrome.storage.local.set({ lastSelection: { subjectId, examId, moduleId } });
  return resource;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  handle(message).then(result => respond({ result }), error => respond({ error: error.message, status: error.status }));
  return true;
});
