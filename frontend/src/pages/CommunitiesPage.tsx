/**
 * CommunitiesPage — browse-by-jurisdiction entry point (#671 gap C).
 *
 * The Explorer already supports narrowing the corpus to one autonomous
 * community via the `jurisdiction` facet (see `FilterRail`'s "Comunidad"
 * chip group), but that filter was buried inside the Explorer's rail —
 * there was no dedicated, browsable surface for "show me everything from
 * Cataluña" the way a legal directory would present it. This page renders
 * every `COMMUNITIES` entry (Estatal + the 17 CCAA) as a card grid; each
 * card deep-links into the Explorer pre-scoped to that jurisdiction.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * - A jurisdiction code is added/removed from the corpus → edit
 *   `COMMUNITIES` in `lib/types.ts`. This page has no local copy of the
 *   list, so it picks the change up automatically.
 * - Per-community law counts: deliberately deferred for v1 (see the note
 *   on `CommunityCard` below) — wiring them naively means 18 parallel
 *   `useLawsList` queries on mount. If counts are wanted, prefer a single
 *   aggregate endpoint (e.g. `GET /api/v1/laws/counts-by-jurisdiction`)
 *   over fanning out from the client.
 *
 * The `/explorer?jurisdiction=<code>` deep link is consumed by
 * `ExplorerPage`'s mount effect, which seeds the `jurisdiction` filter from
 * the URL (alongside `?tags=`/`?q=`/`?userTag=`/`?department=`), so the card
 * lands on the Explorer already scoped to that community (#770).
 */

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Landmark, MapPin, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { COMMUNITIES } from '@/lib/types';
import type { JurisdictionCode } from '@/lib/types';

export function CommunitiesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const goToJurisdiction = (code: JurisdictionCode) => {
    navigate(`/explorer?jurisdiction=${encodeURIComponent(code)}`);
  };

  return (
    <div className="h-full overflow-auto px-5 md:px-8 py-6 scrollbar-thin">
      <header className="mb-6 max-w-2xl">
        <h1 className="font-display text-2xl font-semibold">
          {t('communities.title', 'Comunidades autónomas')}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          {t(
            'communities.subtitle',
            'Explora la legislación por ámbito territorial: normativa estatal o de cada comunidad autónoma.',
          )}
        </p>
      </header>

      <div
        role="list"
        aria-label={t('communities.title', 'Comunidades autónomas')}
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {COMMUNITIES.map(({ code, name }) => (
          // `role="list"` children must be `role="listitem"`; the card itself
          // is the `role="button"` click target, so wrap it to keep both the
          // list semantics ("N items") and the button semantics intact.
          <div role="listitem" key={code}>
            <CommunityCard code={code} name={name} onSelect={goToJurisdiction} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * One jurisdiction card. Renders as a `role="button"` div (not a real
 * anchor — `Card` has no `as="a"` variant in this design system) so the
 * click target is fully keyboard-operable, mirroring the pattern already
 * used for the Explorer's search-hit rows.
 *
 * Deliberately count-free (v1 scope, see the module docstring): showing
 * "N leyes" per card would require either 18 parallel `useLawsList` calls
 * on mount or a dedicated aggregate endpoint — neither exists yet, and
 * fanning out 18 requests just to paint a badge is not worth the latency.
 */
function CommunityCard({
  code,
  name,
  onSelect,
}: {
  code: JurisdictionCode;
  name: string;
  onSelect: (code: JurisdictionCode) => void;
}) {
  const { t } = useTranslation();
  const isNational = code === 'es';
  const Icon = isNational ? Landmark : MapPin;

  return (
    <Card
      hoverable
      role="button"
      tabIndex={0}
      onClick={() => onSelect(code)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(code)}
      aria-label={t('communities.openFor', 'Ver leyes de {{name}} en el Explorador', { name })}
      className="group flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <span
        className={cn(
          'inline-flex size-9 shrink-0 items-center justify-center rounded-lg',
          isNational
            ? 'bg-primary-soft text-indigo-700 dark:text-indigo-200'
            : 'bg-surface-2 text-muted',
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{name}</div>
        <div className="truncate font-mono text-[11px] text-muted">{code}</div>
      </div>
      <ChevronRight className="size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </Card>
  );
}
