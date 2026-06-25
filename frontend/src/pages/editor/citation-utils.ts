/**
 * Pure helpers that turn a corpus search hit into the attributes of a typed
 * legal-citation node (#599).
 *
 * Kept free of React/TipTap so the resolution logic — the only non-trivial
 * part of the citation feature — is unit-testable without booting an editor.
 *
 * --- WHERE TO CHANGE IF THE SEARCH HIT SHAPE CHANGES ---
 * The `payload.lawId` / `articleNumber` fields are produced by the search
 * client (`lib/api/search.ts`) and mirrored by the mock (`lib/api.mock.ts`).
 * If those change, this is the single place that reads them.
 */
import type { ChatSource, SearchHit } from '@/lib/types';

/** Structured attributes stored on a `legalCitation` editor node. */
export interface CitationAttrs {
  /** Internal law id (e.g. `BOE-A-1978-31229`) — drives navigation to `/laws/:lawId`. */
  lawId: string;
  /** Article number when the citation is article-scoped, else `null`. */
  articleNum: string | null;
  /** Human-readable chip text shown in the document. */
  label: string;
}

/**
 * Build the chip label from a hit.
 *
 * Article hits whose title already starts with "Art" (the mock shape) are
 * used verbatim; otherwise the article number is prefixed onto the law title
 * (the live shape, where the title is the parent law's title). Law hits use
 * the title as-is.
 */
function citationLabel(hit: SearchHit): string {
  const title = hit.title.trim();
  const isArticle = hit.kind === 'article' && !!hit.articleNumber;
  if (isArticle && !/^art/i.test(title)) {
    return `Art. ${hit.articleNumber} · ${title}`;
  }
  return title;
}

/**
 * Resolve a corpus search hit into citation node attributes.
 *
 * Returns `null` when the hit carries no `lawId` (so it can't be navigated to)
 * — the caller skips inserting an unresolvable citation.
 */
export function citationFromHit(hit: SearchHit): CitationAttrs | null {
  const lawId = typeof hit.payload?.lawId === 'string' ? hit.payload.lawId : null;
  if (!lawId) return null;

  const articleNum = hit.kind === 'article' && hit.articleNumber ? hit.articleNumber : null;
  return { lawId, articleNum, label: citationLabel(hit) };
}

/**
 * Resolve a streamed RAG source (a `source` SSE event from the chat stack)
 * into citation node attributes (#601).
 *
 * The agentic loop surfaces the laws/articles it grounded an answer on as
 * `ChatSource`s; this turns each into a typed citation so AI-drafted text is
 * inserted with clickable, corpus-resolved references. Returns `null` when the
 * source has no resolved `target.lawId`.
 */
export function citationFromSource(source: ChatSource): CitationAttrs | null {
  const target = source.target;
  if (!target?.lawId) return null;

  const articleNum = target.articleNum ?? null;
  const label = source.article ? `${source.article} · ${source.law}` : source.law;
  return { lawId: target.lawId, articleNum, label };
}
