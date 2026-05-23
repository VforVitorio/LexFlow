/* Pentagon-node mark used only on the marketing landing.
   The in-app shell continues to use the regular BrandMark. */

export function LandingBrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="lf-brand-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(252, 95%, 76%)" />
          <stop offset="100%" stopColor="hsl(217, 91%, 60%)" />
        </linearGradient>
      </defs>
      <g stroke="url(#lf-brand-grad)" strokeWidth="2.5" strokeLinecap="round" fill="none">
        <line x1="9" y1="9" x2="22" y2="11" />
        <line x1="22" y1="11" x2="24" y2="22" />
        <line x1="24" y1="22" x2="13" y2="25" />
        <line x1="13" y1="25" x2="8" y2="17" />
        <line x1="8" y1="17" x2="9" y2="9" />
      </g>
      <circle cx="9" cy="9" r="3" fill="url(#lf-brand-grad)" />
      <circle cx="22" cy="11" r="3" fill="url(#lf-brand-grad)" />
      <circle cx="24" cy="22" r="3" fill="url(#lf-brand-grad)" />
      <circle cx="13" cy="25" r="3" fill="url(#lf-brand-grad)" />
      <circle cx="8" cy="17" r="3" fill="url(#lf-brand-grad)" />
    </svg>
  );
}
