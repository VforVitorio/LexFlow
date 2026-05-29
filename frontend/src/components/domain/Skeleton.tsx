import { cn } from '@/lib/utils';

/**
 * Visual placeholder that mimics the shape of the content while it
 * loads. Replaces the generic "Loading…" string + spinner pattern with
 * something the eye reads as "almost there" instead of "stuck".
 *
 * Use the unstyled `<Skeleton>` block for ad-hoc shapes, or one of the
 * preset compositions for common cases (`<SkeletonLines>`,
 * `<SkeletonCanvas>`, `<SkeletonCards>`).
 *
 * Visual: subtle pulsing rounded box using the same neutral as the
 * surface tokens so it never fights the page's chrome.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-surface-2', className)}
    />
  );
}

/**
 * A vertical stack of N skeleton lines of varying widths — the shape of
 * a paragraph. Used by SearchResultsPage and the law detail body while
 * the real content arrives.
 */
export function SkeletonLines({ count = 4, className }: { count?: number; className?: string }) {
  // Stable pseudo-random widths per line index — keeps the visual stable
  // across re-renders without committing to a single uniform width.
  const widths = ['w-11/12', 'w-9/12', 'w-10/12', 'w-8/12', 'w-7/12', 'w-11/12'];
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', widths[i % widths.length])} />
      ))}
    </div>
  );
}

/**
 * A large rectangular skeleton for areas that hold a canvas, chart, or
 * graph visualization while data loads.
 *
 * `hint` is rendered centered over the box for contextual messaging
 * ("Construyendo grafo, ~30s…") — the warm-up hooks in `queries.ts`
 * decide what to pass.
 */
export function SkeletonCanvas({
  hint,
  className,
}: {
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative h-full w-full', className)} aria-busy>
      <Skeleton className="absolute inset-0 h-full w-full" />
      {hint && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="air-glass max-w-md px-4 py-3 text-center text-[13px] text-muted">{hint}</div>
        </div>
      )}
    </div>
  );
}

/**
 * A vertical stack of N row-shaped skeletons — used by list endpoints
 * (search results, recent changes) while data loads.
 */
export function SkeletonRows({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-busy>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-surface p-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-7/12" />
            <Skeleton className="h-2.5 w-10/12" />
          </div>
        </div>
      ))}
    </div>
  );
}
