import { useId } from 'react';

/**
 * Landing variant of the brand mark — same shape as the in-app BrandMark
 * (four-node tilted diamond) so the favicon, the header row in the nav,
 * the footer and OG image read as one identity. Keeps its own component
 * only because the landing imports it under .landing-root scoped styles
 * and the in-app BrandMark imports `@/lib/utils` which the marketing
 * surface should stay independent from.
 */
export function LandingBrandMark({ size = 26 }: { size?: number }) {
  const uid = useId().replace(/:/g, '');
  const nodeGrad = `lf-land-node-${uid}`;
  const edgeGrad = `lf-land-edge-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={nodeGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(252, 95%, 76%)" />
          <stop offset="100%" stopColor="hsl(217, 91%, 60%)" />
        </linearGradient>
        <linearGradient id={edgeGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(252, 95%, 70%)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="hsl(217, 91%, 58%)" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${edgeGrad})`} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <line x1="11" y1="7"  x2="24" y2="13" />
        <line x1="24" y1="13" x2="21" y2="25" />
        <line x1="21" y1="25" x2="8"  y2="19" />
        <line x1="8"  y1="19" x2="11" y2="7" />
      </g>
      <circle cx="11" cy="7"  r="3.6" fill={`url(#${nodeGrad})`} />
      <circle cx="24" cy="13" r="3.2" fill={`url(#${nodeGrad})`} />
      <circle cx="21" cy="25" r="3.2" fill={`url(#${nodeGrad})`} />
      <circle cx="8"  cy="19" r="3"   fill={`url(#${nodeGrad})`} />
    </svg>
  );
}
