/** Explicit projections keep database-only fields out of strict shared responses. */
export function publicResource(row: any) {
  return {
    id: row.id,
    moduleId: row.moduleId,
    type: row.type,
    title: row.title,
    ...(row.url ? { url: row.url } : {}),
    ...(row.tag ? { tag: row.tag } : {}),
    extractionStatus: row.extractionStatus,
    ...(row.pages
      ? { pages: row.pages.map(({ resourceId, ...p }: any) => p) }
      : {}),
  };
}
export function publicJob(row: any) {
  return { status: row.status, ...(row.error ? { error: row.error } : {}) };
}
export function publicLecture(row: any) {
  return {
    words: row.words,
    flags: row.flags,
    glossary: row.glossary,
    status: row.status,
  };
}
export function plainPages(pages: any[]) {
  return pages.map(({ resourceId, ...p }) => p);
}
export function publicConcept({ embedding, readinessSequence, ...c }: any) {
  return c;
}
