import { defaultServer, selection, serverAddress, suggestModule } from "./capture.js";

const get = id => document.getElementById(id);
const subject = get("subject"), exam = get("exam"), module = get("module");
const save = get("save"), status = get("status"), server = get("server"), suggestion = get("suggestion");
let tree = { subjects: [] };
let tab;
let suggested;
function message(text = "", error = false) {
  status.textContent = text;
  status.classList.toggle("error", error);
}
async function worker(action, data = {}) {
  const response = await chrome.runtime.sendMessage({ action, ...data });
  if (!response || response.error) throw new Error(response?.error ?? "Capture worker did not respond.");
  return response.result;
}
function fill(select, rows, value) {
  select.replaceChildren(...rows.map(item => new Option(item.name, item.id)));
  select.value = value ?? "";
  select.disabled = !rows.length;
}
function render(preferred = {}) {
  const next = selection(tree, preferred);
  fill(subject, tree.subjects, next.subject?.id);
  fill(exam, next.subject?.exams ?? [], next.exam?.id);
  fill(module, next.exam?.modules ?? [], next.module?.id);
  save.textContent = "Save current tab";
  save.disabled = !module.value || !/^https?:\/\//i.test(tab?.url ?? "");
  suggestion.hidden = !suggested || suggested.moduleId === module.value;
}
async function load() {
  message("Loading courses…");
  save.disabled = true;
  try {
    const { lastSelection } = await chrome.storage.local.get("lastSelection");
    tree = await worker("tree");
    suggested = tab && suggestModule(tree, tab);
    if (suggested) suggestion.textContent = `Use suggested module: ${suggested.module.name}`;
    render(lastSelection);
    message(!/^https?:\/\//i.test(tab?.url ?? "") ? "Open a web page to capture it." : module.value ? "" : "Create a module in StudyWeave first.");
  } catch (error) { message(error.message, true); }
}
subject.addEventListener("change", () => render({ subjectId: subject.value }));
exam.addEventListener("change", () => render({ subjectId: subject.value, examId: exam.value }));
module.addEventListener("change", () => render({ subjectId: subject.value, examId: exam.value, moduleId: module.value }));
suggestion.addEventListener("click", () => render(suggested));
get("capture").addEventListener("submit", async event => {
  event.preventDefault();
  if (!module.value || !tab?.id || save.disabled) return;
  const preferred = { subjectId: subject.value, examId: exam.value, moduleId: module.value };
  const controls = [...event.currentTarget.elements].filter(control => !control.disabled);
  for (const control of controls) control.disabled = true;
  message("Saving…");
  try {
    await worker("save", { ...preferred, tabId: tab.id });
    message("Saved. Refresh StudyWeave to see the page.");
    save.textContent = "Saved";
  } catch (error) {
    message(error.message, true);
    save.textContent = "Save current tab";
    save.disabled = false;
  } finally {
    for (const control of controls) if (control !== save) control.disabled = false;
  }
});
get("open-app").addEventListener("click", async () => {
  const { server: selected = defaultServer } = await chrome.storage.local.get("server");
  await chrome.tabs.create({ url: serverAddress(selected).origin });
});
get("settings").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const url = serverAddress(server.value);
    if (!await chrome.permissions.request({ origins: [`${url.protocol}//${url.hostname}/*`] })) {
      throw new Error("Allow access to the API origin to connect.");
    }
    await chrome.storage.local.set({ server: url.origin });
    await load();
  } catch (error) { message(error.message, true); }
});

try {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  get("page-title").textContent = tab?.title ?? "Current tab";
  server.value = (await chrome.storage.local.get("server")).server ?? defaultServer;
  await load();
} catch (error) { message(error.message, true); }
