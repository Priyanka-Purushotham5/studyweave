export const defaultServer = "https://studynova.ink";

export function serverAddress(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error("Enter a valid StudyWeave API URL."); }
  const local = ["127.0.0.1", "localhost"].includes(url.hostname);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:"))) {
    throw new Error("Use an HTTPS server origin or an HTTP localhost origin.");
  }
  return url;
}

export function selection(tree, preferred = {}) {
  const firstSubject = tree.subjects.find(subject => subject.exams.some(exam => exam.modules.length));
  const subject = tree.subjects.find(item => item.id === preferred.subjectId) ?? firstSubject ?? tree.subjects[0];
  const exam = subject?.exams.find(item => item.id === preferred.examId) ?? subject?.exams.find(item => item.modules.length) ?? subject?.exams[0];
  const module = exam?.modules.find(item => item.id === preferred.moduleId) ?? exam?.modules[0];
  return { subject, exam, module };
}

export function capturePayload(moduleId, page) {
  const url = new URL(page.url);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Open an HTTP or HTTPS page to capture it.");
  const type = /^(?:(?:www|m)\.)?(?:youtube\.com|youtu\.be)$/i.test(url.hostname) ? "youtube" : "web";
  return { moduleId, type, url: url.href, title: page.title?.slice(0, 2000) || url.hostname, text: page.text?.slice(0, 60_000) ?? "" };
}

export function suggestModule(tree, page) {
  const title = `${page.title} ${page.url}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  const candidates = tree.subjects.flatMap(subject => subject.exams.flatMap(exam => exam.modules.map(module => ({
    module, moduleId: module.id, subjectId: subject.id, examId: exam.id,
    words: module.name.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [],
  }))));
  return candidates.filter(item => item.words.length && item.words.every(word => title.includes(word)))
    .sort((a, b) => b.module.name.length - a.module.name.length)[0];
}

export async function retryNetwork(request) {
  try { return await request(); } catch (error) {
    if (!(error instanceof TypeError) && error?.name !== "TimeoutError") throw error;
    return request();
  }
}
