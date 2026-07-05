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

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Landmark, MapPin, ChevronRight, Map, List } from 'lucide-react';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { COMMUNITIES } from '@/lib/types';
import type { JurisdictionCode } from '@/lib/types';
import { SpainMap } from './communities/SpainMap';

export function CommunitiesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [view, setView] = useState<'map' | 'list'>('map');
  // National scope isn't a region on the map — surface it as its own button.
  const national = COMMUNITIES.find((c) => !c.code.includes('-'));

  const goToJurisdiction = (code: JurisdictionCode) => {
    navigate(`/explorer?jurisdiction=${encodeURIComponent(code)}`);
  };

  return (
    <div className="h-full max-w-content overflow-auto px-5 md:px-8 py-6 scrollbar-thin">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="font-display text-2xl font-semibold">
            {t('communities.title', 'Comunidades autónomas')}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            {t(
              'communities.subtitle',
              'Explora la legislación por ámbito territorial: normativa estatal o de cada comunidad autónoma.',
            )}
          </p>
        </div>
        {/* Map / list toggle (#846) — the map is the visual, spatial way in;
            the card list stays as the keyboard/screen-reader fallback. */}
        <div className="inline-flex shrink-0 rounded-lg border border-border-strong bg-surface p-0.5 text-[13px]">
          <button
            type="button"
            onClick={() => setView('map')}
            aria-pressed={view === 'map'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors',
              view === 'map' ? 'bg-primary-soft font-medium text-indigo-700 dark:text-indigo-200' : 'text-muted hover:text-fg',
            )}
          >
            <Map className="size-3.5" /> {t('communities.mapView', 'Mapa')}
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors',
              view === 'list' ? 'bg-primary-soft font-medium text-indigo-700 dark:text-indigo-200' : 'text-muted hover:text-fg',
            )}
          >
            <List className="size-3.5" /> {t('communities.listView', 'Lista')}
          </button>
        </div>
      </header>

      {view === 'map' ? (
        <div className="flex flex-col items-center gap-5">
          {national && (
            <button
              type="button"
              onClick={() => goToJurisdiction(national.code)}
              className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-[13.5px] font-medium transition-colors hover:border-indigo-300 hover:bg-primary-soft"
            >
              <Landmark className="size-4 text-indigo-600 dark:text-indigo-300" />
              {t('communities.national', 'Normativa estatal (todo el Estado)')}
            </button>
          )}
          <SpainMap className="w-full" />
        </div>
      ) : (
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
      )}
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
        <div className="font-semibold leading-snug line-clamp-2">{name}</div>
        <div className="truncate font-mono text-[11px] text-muted">{code}</div>
      </div>
      <ChevronRight className="size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </Card>
  );
}
