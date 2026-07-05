/**
 * Document import for the editor templates (#600) — .docx / .md → TipTap JSON.
 *
 * Completes the template system: v1 saved/filled templates; this lets users
 * **upload** an external `.docx` or `.md` file and store it as a template
 * (its `{{variable}}` placeholders are picked up by `extractVariables`).
 *
 * Pipeline: file → HTML → TipTap JSON.
 * - `.docx` → HTML with **mammoth**, `.md` → HTML with **marked**. Both are
 *   dynamic-imported inside their parser so the libraries land in their own
 *   lazy chunks, not the editor route.
 * - HTML → TipTap JSON with ProseMirror's `DOMParser` against the editor's
 *   live schema, so imported content maps to exactly the nodes the editor
 *   supports (unknown markup degrades to text; custom nodes like
 *   `legalCitation` simply don't appear in imported files).
 *
 * --- WHERE TO CHANGE IF A NEW IMPORT FORMAT IS ADDED ---
 * - Add a branch in `importFile` + extend `SUPPORTED_IMPORT` and its parser.
 */
import type { JSONContent } from '@tiptap/react';
import type { Schema } from '@tiptap/pm/model';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';

/** Extensions this module accepts, as a user-facing hint + input `accept`. */
export const SUPPORTED_IMPORT = '.docx,.md,.markdown';

const IMPORT_RE = /\.(docx|md|markdown)$/i;

/** Whether a filename is an importable template document. */
export function isSupportedImport(filename: string): boolean {
  return IMPORT_RE.test(filename);
}

/** Convert a Markdown string to HTML (marked lazy-loaded). */
async function markdownToHtml(markdown: string): Promise<string> {
  const { marked } = await import('marked');
  return marked.parse(markdown, { async: false }) as string;
}

/** Convert a .docx ArrayBuffer to HTML (mammoth lazy-loaded). */
async function docxToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const mod = await import('mammoth');
  const mammoth = mod.default ?? mod;
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
}

/**
 * Parse an HTML string into TipTap document JSON using a ProseMirror schema.
 * Pure over (html, schema) — the caller passes `editor.schema`, tests pass a
 * schema built from the same extensions via `getSchema`.
 */
export function htmlToTiptapContent(html: string, schema: Schema): JSONContent {
  const body = new window.DOMParser().parseFromString(html, 'text/html').body;
  const node = ProseMirrorDOMParser.fromSchema(schema).parse(body);
  return node.toJSON() as JSONContent;
}

/** Filename stem (no extension) → a template name, falling back to "Plantilla". */
function templateName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').trim() || 'Plantilla';
}

export interface ImportedDocument {
  /** Suggested template name (the file stem). */
  name: string;
  /** Parsed TipTap document content. */
  content: JSONContent;
}

/**
 * Import an uploaded file into TipTap template content, routed by extension.
 *
 * @throws Error when the file type is unsupported — the caller surfaces the
 *   message to the user (an upload is user-initiated; failing silently would
 *   look like a no-op).
 */
export async function importFile(file: File, schema: Schema): Promise<ImportedDocument> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.docx')) {
    const html = await docxToHtml(await file.arrayBuffer());
    return { name: templateName(file.name), content: htmlToTiptapContent(html, schema) };
  }
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    const html = await markdownToHtml(await file.text());
    return { name: templateName(file.name), content: htmlToTiptapContent(html, schema) };
  }
  throw new Error(`Formato no soportado: ${file.name}. Sube un archivo .docx o .md.`);
}
