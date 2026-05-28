import { cn } from '@/lib/utils';

export interface HighlightedSnippetProps {
  /** The snippet text to render. */
  text: string;
  /**
   * Character offsets of the match within `text`. When omitted (e.g. the
   * backend couldn't locate the query inside the trimmed snippet) the
   * component degrades to a plain text render.
   */
  match?: { start: number; end: number } | null;
  /** Optional prefix (e.g. `Art. 28 — `). Never highlighted. */
  prefix?: string;
  className?: string;
}

/**
 * Render a search-result snippet with the matched substring wrapped in a
 * visually highlighted `<mark>`. Falls back to plain text when no match
 * offsets are available so the call sites stay simple.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Offsets are produced by the backend's `_locate_match` (and mirrored by
 * the mock's `locateInMock`). If the snippet pipeline changes, those two
 * are the only places that need to move.
 */
export function HighlightedSnippet({ text, match, prefix, className }: HighlightedSnippetProps) {
  const hasMatch = match && match.end > match.start && match.start >= 0 && match.end <= text.length;

  if (!hasMatch) {
    return (
      <span className={className}>
        {prefix}
        {text}
      </span>
    );
  }

  const before = text.slice(0, match.start);
  const hit = text.slice(match.start, match.end);
  const after = text.slice(match.end);

  return (
    <span className={className}>
      {prefix}
      {before}
      <mark className={cn('rounded-sm bg-amber-200/70 px-0.5 text-fg dark:bg-amber-400/30')}>{hit}</mark>
      {after}
    </span>
  );
}
