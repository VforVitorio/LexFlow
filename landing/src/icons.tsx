/* Small inline icons used across the landing. Kept here so the section files
   read top-to-bottom without 80 lines of SVG up front. */

import type { ReactNode } from 'react';

export const IconSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

export const IconMoon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const IconGitHub = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.8 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.7.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.6 3.3-1.2 3.3-1.2.7 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.5-1.5 7.8-5.8 7.8-10.9C23.5 5.7 18.3.5 12 .5z" />
  </svg>
);

export const IconArrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const IconBook = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

export const IconMenu = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const IconClose = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

// Stat-bar icons, in order: book(laws) · chip(AI models) · shield(local/privacy)
// · gift(free & open source). Order mirrors `stats[]` in the landing locales.
export const STAT_ICONS: ReactNode[] = [
  <svg key="book" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>,
  <svg key="chip" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
  </svg>,
  <svg key="shield" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>,
  <svg key="gift" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13" />
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8" />
    <path d="M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8" />
  </svg>,
];

interface TechLogo { name: string; href: string; svg: ReactNode; }

export const TECH_LOGOS: TechLogo[] = [
  {
    name: 'Python',
    href: 'https://www.python.org',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 3.5h5a3 3 0 0 1 3 3v3h-8a3 3 0 0 0-3 3v2.5" />
        <path d="M14.5 20.5h-5a3 3 0 0 1-3-3v-3h8a3 3 0 0 0 3-3V9" />
        <circle cx="9.5" cy="6.5" r="0.8" fill="currentColor" />
        <circle cx="14.5" cy="17.5" r="0.8" fill="currentColor" />
      </svg>
    ),
  },
  {
    name: 'FastAPI',
    href: 'https://fastapi.tiangolo.com',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2 L4 13 h6 l-2 9 L20 11 h-6 z" />
      </svg>
    ),
  },
  {
    name: 'React',
    href: 'https://react.dev',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" />
        <ellipse cx="12" cy="12" rx="10" ry="4" />
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
      </svg>
    ),
  },
  {
    name: 'TypeScript',
    href: 'https://www.typescriptlang.org',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <text x="12" y="16" textAnchor="middle" fontFamily="Space Grotesk, sans-serif" fontWeight="700" fontSize="10">TS</text>
      </svg>
    ),
  },
  {
    name: 'Tailwind',
    href: 'https://tailwindcss.com',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11c1.5-3 3.5-4.5 6-4.5 3.75 0 4.25 3 6.75 3.6 1.5.4 3-.2 4.25-1.6-1.5 3-3.5 4.5-6 4.5-3.75 0-4.25-3-6.75-3.6C5.75 9 4.25 9.6 3 11z" />
        <path d="M3 19c1.5-3 3.5-4.5 6-4.5 3.75 0 4.25 3 6.75 3.6 1.5.4 3-.2 4.25-1.6-1.5 3-3.5 4.5-6 4.5-3.75 0-4.25-3-6.75-3.6C5.75 17 4.25 17.6 3 19z" />
      </svg>
    ),
  },
  {
    name: 'NetworkX',
    href: 'https://networkx.org',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="6" r="2" fill="currentColor" />
        <circle cx="19" cy="6" r="2" fill="currentColor" />
        <circle cx="12" cy="13" r="2" fill="currentColor" />
        <circle cx="6" cy="20" r="2" fill="currentColor" />
        <circle cx="18" cy="20" r="2" fill="currentColor" />
        <path d="M5 6L12 13M19 6L12 13M12 13L6 20M12 13L18 20" />
      </svg>
    ),
  },
  {
    name: 'Plotly',
    href: 'https://plotly.com',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3"  y="14" width="3.5" height="7"  rx="0.5" fill="currentColor" />
        <rect x="9"  y="9"  width="3.5" height="12" rx="0.5" fill="currentColor" />
        <rect x="15" y="5"  width="3.5" height="16" rx="0.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    name: 'MCP',
    href: 'https://modelcontextprotocol.io',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v18" />
        <path d="M5 7l7-4 7 4" />
        <path d="M5 17l7 4 7-4" />
        <path d="M3 12h18" />
      </svg>
    ),
  },
];

export const GH_URL = 'https://github.com/VforVitorio/LexFlow';

/* Persona icons (#181). Lucide-flavoured strokes at 22 px, stroke-width 1.6
 * so they sit visually with the section eyebrows and chip metas. Used by
 * <Personas />; key matches `personas.list[*].icon` in the i18n schema. */
export const PERSONA_ICONS: Record<string, ReactNode> = {
  scale: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v18" />
      <path d="M8 21h8" />
      <path d="M3 7h18" />
      <path d="M6 7l-3 6a4 4 0 0 0 6 0z" />
      <path d="M18 7l-3 6a4 4 0 0 0 6 0z" />
    </svg>
  ),
  book: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5a2.5 2.5 0 0 0-2.5 2.5z" />
      <path d="M4 4.5v17A2.5 2.5 0 0 0 6.5 22H20" />
      <path d="M8 7h8M8 11h6" />
    </svg>
  ),
  newspaper: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h13v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z" />
      <path d="M17 8h3v11a2 2 0 0 1-2 2" />
      <path d="M8 8h6M8 12h6M8 16h4" />
    </svg>
  ),
  shield: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
};
