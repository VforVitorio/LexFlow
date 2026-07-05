import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { SPAIN_VIEWBOX, SPAIN_PATHS } from './spain-map-data';

/**
 * Interactive map of Spain's autonomous communities (#846).
 *
 * Each region is a focusable button-path: hover/focus shades it and shows its
 * name, click/Enter navigates to that jurisdiction's laws. The card list on
 * CommunitiesPage is the accessible, keyboard/screen-reader fallback — this map
 * is the visual, spatial way in.
 *
 * Path geometry lives in `spain-map-data.ts` (auto-generated, amCharts geodata,
 * ISO 3166-2 ids lowercased to the app's `es-XX` jurisdiction codes).
 */
export function SpainMap({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<string | null>(null);

  const select = (code: string) =>
    navigate(`/explorer?jurisdiction=${encodeURIComponent(code)}`);

  const active = SPAIN_PATHS.find((r) => r.code === hovered);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <svg
        viewBox={SPAIN_VIEWBOX}
        className="h-auto w-full max-w-2xl"
        role="group"
        aria-label="Mapa de comunidades autónomas de España"
      >
        {SPAIN_PATHS.map((r) => (
          <path
            key={r.code}
            d={r.d}
            role="button"
            tabIndex={0}
            aria-label={r.name}
            onMouseEnter={() => setHovered(r.code)}
            onMouseLeave={() => setHovered((h) => (h === r.code ? null : h))}
            onFocus={() => setHovered(r.code)}
            onBlur={() => setHovered((h) => (h === r.code ? null : h))}
            onClick={() => select(r.code)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                select(r.code);
              }
            }}
            className={cn(
              'cursor-pointer fill-surface-2 stroke-border outline-none transition-colors [stroke-width:0.6]',
              'hover:fill-primary-soft focus-visible:fill-primary-soft focus-visible:stroke-indigo-500 focus-visible:[stroke-width:1]',
              hovered === r.code && 'fill-primary-soft stroke-indigo-500',
            )}
          />
        ))}
      </svg>
      {/* Live region: the hovered/focused community's name. */}
      <div className="mt-3 h-5 text-[13.5px] font-semibold text-indigo-700 dark:text-indigo-300" aria-live="polite">
        {active ? active.name : <span className="font-normal text-muted">Pasa el ratón o tabula por una comunidad para seleccionarla</span>}
      </div>
    </div>
  );
}
