/**
 * Document export for the editor (#861) — TipTap JSON → Markdown / DOCX.
 *
 * The editor is StarterKit + `legalCitation` (inline atom, #599) + `comment`
 * mark (#602). This module walks the TipTap JSON once per format:
 *
 * - Markdown: a small, dependency-free serializer (the pure, well-tested core).
 * - DOCX: built with the `docx` library, which is **injected** (`DocxModule`)
 *   so the heavy dependency stays out of the editor route's chunk — the caller
 *   `await import('docx')` inside `exportDocx` and hands the module in. That
 *   also keeps `documentToDocxBlocks` unit-testable without a static docx import.
 *
 * Invariants:
 * - Legal citations (#599) export as their `label` — a Markdown link to
 *   `/laws/:lawId` when resolved, italic text in DOCX. The structured attrs are
 *   editorial metadata, not document text.
 * - Comment marks (#602) are editorial annotations and are NEVER emitted into
 *   the exported document — only the underlying text survives.
 *
 * --- WHERE TO CHANGE IF THE EDITOR'S NODE SET CHANGES ---
 * - New block/inline node or mark → add a case in `blockToMarkdown` /
 *   `inlineToMarkdown` and `blockToDocx` / `inlineToRuns`. Unknown nodes
 *   degrade by recursing into their `content` (never throw on export).
 */
import type { JSONContent } from '@tiptap/react';
// Type-only import → fully erased at build time, so `docx` is NOT bundled here.
import type { Paragraph, TextRun } from 'docx';

type DocxModule = typeof import('docx');

// ── Markdown (pure, dependency-free) ────────────────────────────────────────

/** Wrap a text run in the Markdown syntax for each of its marks. */
function applyMarks(text: string, marks?: { type: string }[]): string {
  if (!marks?.length) return text;
  let out = text;
  for (const mark of marks) {
    if (mark.type === 'bold') out = `**${out}**`;
    else if (mark.type === 'italic') out = `*${out}*`;
    else if (mark.type === 'code') out = `\`${out}\``;
    else if (mark.type === 'strike') out = `~~${out}~~`;
    // `comment` (#602) is editorial — intentionally not serialised.
  }
  return out;
}

/** Serialize inline content (text, hard breaks, citations) to a Markdown string. */
function inlineToMarkdown(nodes?: JSONContent[]): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.type === 'text') return applyMarks(node.text ?? '', node.marks);
      if (node.type === 'hardBreak') return '  \n';
      if (node.type === 'legalCitation') {
        const label = String(node.attrs?.label ?? '');
        const lawId = node.attrs?.lawId;
        return lawId ? `[${label}](/laws/${lawId})` : label;
      }
      return inlineToMarkdown(node.content);
    })
    .join('');
}

/** Plain (unmarked) text of inline content — used for code blocks. */
function inlineText(nodes?: JSONContent[]): string {
  if (!nodes) return '';
  return nodes.map((node) => node.text ?? inlineText(node.content)).join('');
}

/** Serialize one list item (its lead block + any nested list) with a marker. */
function listItemToMarkdown(item: JSONContent, marker: string, depth: number): string {
  const indent = '  '.repeat(depth);
  const parts = (item.content ?? []).map((block) =>
    block.type === 'bulletList' || block.type === 'orderedList'
      ? blockToMarkdown(block, depth + 1)
      : blockToMarkdown(block, depth),
  );
  const [lead = '', ...nested] = parts;
  return [`${indent}${marker}${lead}`, ...nested].join('\n');
}

/** Serialize one block-level node to Markdown. */
function blockToMarkdown(node: JSONContent, depth = 0): string {
  switch (node.type) {
    case 'paragraph':
      return inlineToMarkdown(node.content);
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      return `${'#'.repeat(level)} ${inlineToMarkdown(node.content)}`;
    }
    case 'bulletList':
      return (node.content ?? []).map((li) => listItemToMarkdown(li, '- ', depth)).join('\n');
    case 'orderedList':
      return (node.content ?? [])
        .map((li, i) => listItemToMarkdown(li, `${i + 1}. `, depth))
        .join('\n');
    case 'blockquote':
      return (node.content ?? [])
        .map((child) => blockToMarkdown(child, depth))
        .join('\n\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'codeBlock':
      return `\`\`\`${node.attrs?.language ?? ''}\n${inlineText(node.content)}\n\`\`\``;
    case 'horizontalRule':
      return '---';
    default:
      return (node.content ?? []).map((child) => blockToMarkdown(child, depth)).join('\n\n');
  }
}

/** Serialize a whole TipTap document to a Markdown string. */
export function documentToMarkdown(doc: JSONContent): string {
  const body = (doc.content ?? [])
    .map((block) => blockToMarkdown(block))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return `${body}\n`;
}

// ── DOCX (via injected `docx` module) ───────────────────────────────────────

/** Build DOCX text runs from inline content, carrying bold/italic. */
function inlineToRuns(nodes: JSONContent[] | undefined, d: DocxModule, forceItalic = false): TextRun[] {
  const runs: TextRun[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'text') {
      const marks = new Set((node.marks ?? []).map((m) => m.type));
      runs.push(
        new d.TextRun({
          text: node.text ?? '',
          bold: marks.has('bold'),
          italics: forceItalic || marks.has('italic'),
        }),
      );
    } else if (node.type === 'hardBreak') {
      runs.push(new d.TextRun({ text: '', break: 1 }));
    } else if (node.type === 'legalCitation') {
      runs.push(new d.TextRun({ text: String(node.attrs?.label ?? ''), italics: true }));
    } else if (node.content) {
      runs.push(...inlineToRuns(node.content, d, forceItalic));
    }
  }
  return runs;
}

const HEADING_BY_LEVEL: Record<number, 'HEADING_1' | 'HEADING_2' | 'HEADING_3'> = {
  1: 'HEADING_1',
  2: 'HEADING_2',
  3: 'HEADING_3',
};

/** Serialize one block-level node to one or more DOCX paragraphs. */
function blockToDocx(node: JSONContent, d: DocxModule): Paragraph[] {
  switch (node.type) {
    case 'paragraph':
      return [new d.Paragraph({ children: inlineToRuns(node.content, d) })];
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1)));
      return [new d.Paragraph({ heading: d.HeadingLevel[HEADING_BY_LEVEL[level]], children: inlineToRuns(node.content, d) })];
    }
    case 'bulletList':
      // Native Word bullets — no document-level numbering config needed.
      return (node.content ?? []).flatMap((li) =>
        (li.content ?? []).flatMap((block) =>
          block.type === 'bulletList' || block.type === 'orderedList'
            ? blockToDocx(block, d)
            : [new d.Paragraph({ bullet: { level: 0 }, children: inlineToRuns(block.content, d) })],
        ),
      );
    case 'orderedList':
      // Manual "N. " prefix avoids DOCX numbering-instance setup and always renders.
      return (node.content ?? []).flatMap((li, i) =>
        (li.content ?? []).flatMap((block) =>
          block.type === 'bulletList' || block.type === 'orderedList'
            ? blockToDocx(block, d)
            : [new d.Paragraph({ children: [new d.TextRun({ text: `${i + 1}. ` }), ...inlineToRuns(block.content, d)] })],
        ),
      );
    case 'blockquote':
      return (node.content ?? []).map(
        (child) => new d.Paragraph({ indent: { left: 480 }, children: inlineToRuns(child.content, d, true) }),
      );
    case 'codeBlock':
      return [new d.Paragraph({ children: [new d.TextRun({ text: inlineText(node.content), font: 'Consolas' })] })];
    case 'horizontalRule':
      return [new d.Paragraph({ children: [new d.TextRun({ text: '———' })] })];
    default:
      return (node.content ?? []).flatMap((child) => blockToDocx(child, d));
  }
}

/** Build the DOCX paragraph list for a whole document (pure; `docx` injected). */
export function documentToDocxBlocks(doc: JSONContent, d: DocxModule): Paragraph[] {
  return (doc.content ?? []).flatMap((block) => blockToDocx(block, d));
}

// ── Download side-effects ────────────────────────────────────────────────────

/** Turn a document title into a safe file stem, falling back to "documento". */
export function fileStem(title: string): string {
  // NFD decomposes accents ("é" → "e" + combining mark); the ASCII filter on
  // the next line then drops the combining marks, so no explicit strip needed.
  const slug = title
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'documento';
}

/** Trigger a browser download of a blob under the given filename. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Export the document as a Markdown (.md) file. */
export function exportMarkdown(doc: JSONContent, title: string): void {
  const markdown = documentToMarkdown(doc);
  triggerDownload(new Blob([markdown], { type: 'text/markdown' }), `${fileStem(title)}.md`);
}

/**
 * Export the document as a Word (.docx) file. `docx` is dynamically imported
 * so it never lands in the editor route's initial chunk.
 */
export async function exportDocx(doc: JSONContent, title: string): Promise<void> {
  const d = await import('docx');
  const document = new d.Document({ sections: [{ children: documentToDocxBlocks(doc, d) }] });
  const blob = await d.Packer.toBlob(document);
  triggerDownload(blob, `${fileStem(title)}.docx`);
}
