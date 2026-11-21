/**
 * Helpers for the chat "Document" lane (Decider route 'document').
 * The lane used to print the generated text in the chat and stop, so no file was ever created.
 * These pure helpers turn that text into a file proposal: a clean Markdown body and a safe, unique path.
 * Writing still goes through the harness (pending diff -> review -> apply), never directly.
 */

export const DOCS_DIR = 'docs';

/** Models often wrap the whole answer in a ```markdown fence; the file must hold the document, not the fence. */
export function cleanDocumentText(raw: string): string {
  const t = raw.replace(/\r\n/g, '\n').trim();
  const fenced = t.match(/^```(?:markdown|md)?[ \t]*\n([\s\S]*?)\n```$/i);
  return `${(fenced ? fenced[1] : t).trim()}\n`;
}

/** First level-1/2 heading if present, otherwise the start of the request. */
export function documentTitle(content: string, request: string): string {
  const h = content.match(/^ {0,3}#{1,2}[ \t]+(.+?)[ \t]*#*[ \t]*$/m);
  if (h && h[1].trim()) { return h[1].trim(); }
  return request.trim().slice(0, 60);
}

export function slugify(s: string): string {
  const slug = s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'documento';
}

/** First free `docs/<slug>.md`, `docs/<slug>-2.md`, ... `exists` must also account for changes that are staged but not written yet. */
export async function nextFreeDocPath(slug: string, exists: (rel: string) => Promise<boolean>, dir = DOCS_DIR): Promise<string> {
  for (let i = 1; i < 100; i++) {
    const rel = `${dir}/${slug}${i === 1 ? '' : `-${i}`}.md`;
    if (!(await exists(rel))) { return rel; }
  }
  return `${dir}/${slug}-${Date.now()}.md`;
}
