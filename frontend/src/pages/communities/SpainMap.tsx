import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  SPAIN_VIEWBOX,
  SPAIN_PATHS,
  CANARIAS,
  CANARIAS_TRANSFORM,
  CANARIAS_BOX,
  CITIES,
  AFRICA_COAST,
} from './spain-map-data';

/**
 * Interactive map of Spain's autonomous communities (#846).
 *
 * Peninsula + Balearic regions fill the frame; Canarias sits in a traditional
 * bottom-left inset box; Ceuta and Melilla are dot markers (no polygons exist
 * for them in the amCharts geodata). Each region/city is a focusable button:
 * hover/focus shades it and shows its name, click/Enter navigates to that
 * jurisdiction's laws. The card list on CommunitiesPage is the accessible,
 * keyboard/screen-reader fallback — this map is the visual, spatial way in.
 */
export function SpainMap({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<string | null>(null);

  const select = (code: string) => navigate(`/explorer?jurisdiction=${encodeURIComponent(code)}`);

  const regionClasses = (code: string) =>
    cn(
      'cursor-pointer fill-surface-2 stroke-border outline-none transition-colors [stroke-width:0.6]',
      'hover:fill-primary-soft focus-visible:fill-primary-soft focus-visible:stroke-indigo-500 focus-visible:[stroke-width:1]',
      hovered === code && 'fill-primary-soft stroke-indigo-500',
    );

  // Shared interaction props for any focusable region/city.
  const interactive = (code: string, name: string) => ({
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': name,
    onMouseEnter: () => setHovered(code),
    onMouseLeave: () => setHovered((h) => (h === code ? null : h)),
    onFocus: () => setHovered(code),
    onBlur: () => setHovered((h) => (h === code ? null : h)),
    onClick: () => select(code),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(code);
      }
    },
  });

  const active =
    SPAIN_PATHS.find((r) => r.code === hovered) ??
    (CANARIAS.code === hovered ? CANARIAS : undefined) ??
    CITIES.find((c) => c.code === hovered);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* Live region ABOVE the map: the hovered/focused region's name, large
          so it reads at a glance without the eye leaving the map (#846). */}
      <div
        className="mb-3 flex h-9 items-center text-center text-2xl font-semibold text-indigo-700 dark:text-indigo-300"
        aria-live="polite"
      >
        {active ? (
          active.name
        ) : (
          <span className="text-sm font-normal text-muted">
            Pasa el ratón o tabula por una comunidad para seleccionarla
          </span>
        )}
      </div>

      <svg
        viewBox={SPAIN_VIEWBOX}
        className="h-auto w-full max-w-3xl"
        role="group"
        aria-label="Mapa de comunidades autónomas de España"
      >
        {/* Peninsula + Balearic */}
        {SPAIN_PATHS.map((r) => (
          <path key={r.code} d={r.d} className={regionClasses(r.code)} {...interactive(r.code, r.name)} />
        ))}

        {/* Canarias inset: framed box + the region scaled/translated into it. */}
        <rect
          x={CANARIAS_BOX.x}
          y={CANARIAS_BOX.y}
          width={CANARIAS_BOX.w}
          height={CANARIAS_BOX.h}
          rx={3}
          className="fill-none stroke-border [stroke-dasharray:3_2] [stroke-width:0.6]"
        />
        <g transform={CANARIAS_TRANSFORM}>
          <path d={CANARIAS.d} className={regionClasses(CANARIAS.code)} {...interactive(CANARIAS.code, CANARIAS.name)} />
        </g>

        {/* North African coast — context so Ceuta/Melilla aren't floating dots. */}
        <path d={AFRICA_COAST} className="pointer-events-none fill-surface-2 [fill-opacity:0.7]" />

        {/* Ceuta / Melilla — markers on the coast, labelled above. */}
        {CITIES.map((c) => (
          <g key={c.code} className="cursor-pointer" {...interactive(c.code, c.name)}>
            <text
              x={c.cx}
              y={c.cy - 3.6}
              textAnchor="middle"
              className="pointer-events-none fill-muted font-sans text-[7px]"
            >
              {c.name}
            </text>
            <circle
              cx={c.cx}
              cy={c.cy}
              r={2.4}
              className={cn(
                'fill-surface-2 stroke-border transition-colors [stroke-width:0.6]',
                hovered === c.code && 'fill-primary-soft stroke-indigo-500',
              )}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
