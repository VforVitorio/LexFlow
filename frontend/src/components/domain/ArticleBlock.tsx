import { cn } from '@/lib/utils';
import type { Article, ArticleRef } from '@/lib/types';

export interface ArticleBlockProps {
  article: Article;
  /** Override the reading font-size from a parent (sync'd to the Tweaks slider). */
  size?: number;
  /** Called when a footnote reference is clicked. */
  onCitationClick?: (ref: ArticleRef) => void;
}

/**
 * Single article rendered with number in the gutter, body in the reading
 * column, and references as monospace chips below.
 */
export function ArticleBlock({ article, size = 16, onCitationClick }: ArticleBlockProps) {
  return (
    <article id={`art-${article.num}`} className="relative mb-9">
      <div className="absolute left-[-72px] top-1 hidden w-14 text-right md:block">
        <div className="font-mono text-[13px] font-semibold text-amber-700 dark:text-amber-400">
          Art. {article.num}
        </div>
      </div>
      <h3 className="mb-2.5 font-display text-[17px] font-semibold">{article.titulo}</h3>
      {article.body.map((clause, i) => (
        <p
          key={i}
          className="mb-3 text-pretty leading-relaxed"
          style={{ fontSize: size, lineHeight: 1.7 }}
        >
          {clause.marker && <span className="font-semibold mr-1">{clause.marker}.</span>}
          {clause.text}{' '}
          {clause.citations.map((c, ci) => (
            <CitationSup key={ci} index={ci + 1} ref_={c} onClick={() => onCitationClick?.(c)} />
          ))}
        </p>
      ))}
      {article.refs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {article.refs.map((r, i) => (
            <span
              key={i}
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-px font-mono text-[11px]',
                'bg-surface-2 text-muted',
              )}
            >
              {r.label}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function CitationSup({ index, ref_, onClick }: { index: number; ref_: ArticleRef; onClick?: () => void }) {
  return (
    <sup
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick?.(); }}
      title={ref_.label}
      className={cn(
        'cursor-pointer rounded bg-primary-soft px-1 py-0.5 font-mono text-[0.65em] font-semibold text-indigo-600 dark:text-indigo-300',
        'hover:bg-indigo-200 dark:hover:bg-indigo-800',
      )}
    >
      {index}
    </sup>
  );
}
