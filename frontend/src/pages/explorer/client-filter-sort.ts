/**
 * Page-scoped client filter + sort for the Explorer list.
 *
 * Extracted from `ExplorerPage` to shrink that god component and make the
 * logic unit-testable (#556). It is a PAGE-SCOPED fallback (#475): it narrows
 * and sorts the page the server already returned — it does NOT fetch or search
 * across pages.
 *
 * WHERE TO CHANGE IF X CHANGES: when the backend list endpoint accepts
 * `q`/`sort`/`tags`, move this back into `listLawsQuery`
 * (lib/api/transformers.ts) and delete this module.
 */
import type { Law } from '@/lib/types';

export type LawSort = 'relevance' | 'date' | 'refs' | 'title';

export interface ClientFilterSort {
  /** Free-text needle, already stripped of `#tag` tokens. */
  plainQ: string;
  /** Active tags (chip-driven + inline `#tag`), matched AND. */
  allTags: Set<string>;
  sort: LawSort;
}

/** Narrow + sort `items` for display. `relevance` preserves server order. */
export function applyClientFilterSort(items: Law[], { plainQ, allTags, sort }: ClientFilterSort): Law[] {
  let rows = items;

  if (plainQ) {
    const needle = plainQ.toLowerCase();
    rows = rows.filter(
      (l) =>
        l.title.toLowerCase().includes(needle) ||
        l.short.toLowerCase().includes(needle) ||
        l.boe.toLowerCase().includes(needle),
    );
  }
  if (allTags.size) {
    // AND over the law's tags: every active tag must be present.
    rows = rows.filter((l) => {
      const lawTags = new Set((l.tags ?? []).map((tag) => tag.toLowerCase()));
      return [...allTags].every((tag) => lawTags.has(tag.toLowerCase()));
    });
  }

  if (sort === 'relevance') return rows;
  const sorted = [...rows];
  switch (sort) {
    case 'date':
      sorted.sort((a, b) => b.publicada.localeCompare(a.publicada));
      break;
    case 'title':
      sorted.sort((a, b) => (a.short || a.title).localeCompare(b.short || b.title));
      break;
    case 'refs':
      sorted.sort((a, b) => b.referencias - a.referencias);
      break;
  }
  return sorted;
}
