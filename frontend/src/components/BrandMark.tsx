import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * LexFlow brand mark — four-node graph in a tilted diamond.
 *
 * The same shape ships at three sizes: 16×16 (favicon), 22-26 (header /
 * brand row), and 88+ (hero / OG image). `useId` keeps the gradient ids
 * unique when multiple BrandMark instances render in the same document
 * (e.g. header + left rail + footer).
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Public favicon:  frontend/public/favicon.svg (same paths, hard-coded ids)
 * Landing variant: landing/src/mocks/LandingBrandMark.tsx (separate project)
 */
export function BrandMark({
  size = 24,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const nodeGrad = `lf-node-${uid}`;
  const edgeGrad = `lf-edge-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn('inline-block align-middle', className)}
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
