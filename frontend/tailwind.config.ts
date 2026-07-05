import type { Config } from 'tailwindcss';

/**
 * LexFlow design tokens — single source of truth.
 *
 * Every colour is exposed as an HSL channel triple (e.g. `232 72% 52%`) on a
 * CSS variable, then surfaced here as `hsl(var(--token))`. That lets you write
 * `bg-indigo-500/40` and have the opacity modifier work without polluting the
 * variable.
 *
 * Light + dark themes flip the neutrals via a `[data-theme="dark"]` attribute
 * on `<html>` — see `src/index.css`.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', md: '1.5rem' },
      screens: { '2xl': '1440px' },
    },
    extend: {
      colors: {
        // Surfaces — flip light/dark via [data-theme]
        bg:        'hsl(var(--bg) / <alpha-value>)',
        surface:   'hsl(var(--surface) / <alpha-value>)',
        'surface-2': 'hsl(var(--surface-2) / <alpha-value>)',
        border:    'hsl(var(--border) / <alpha-value>)',
        'border-strong': 'hsl(var(--border-strong) / <alpha-value>)',
        muted:     'hsl(var(--muted-fg) / <alpha-value>)',
        fg:        'hsl(var(--fg) / <alpha-value>)',

        // Primary palette — deep indigo, spine of the brand.
        indigo: {
          50:  'hsl(232 100% 97% / <alpha-value>)',
          100: 'hsl(232 88% 93%  / <alpha-value>)',
          200: 'hsl(232 84% 85%  / <alpha-value>)',
          300: 'hsl(232 80% 74%  / <alpha-value>)',
          400: 'hsl(232 75% 62%  / <alpha-value>)',
          500: 'hsl(232 72% 52%  / <alpha-value>)',
          600: 'hsl(232 70% 44%  / <alpha-value>)',
          700: 'hsl(232 72% 36%  / <alpha-value>)',
          800: 'hsl(232 75% 28%  / <alpha-value>)',
          900: 'hsl(232 80% 20%  / <alpha-value>)',
          950: 'hsl(232 85% 12%  / <alpha-value>)',
        },

        // Accent — warm amber for citations, marginalia, active states.
        amber: {
          300: 'hsl(38 95% 72% / <alpha-value>)',
          500: 'hsl(36 95% 56% / <alpha-value>)',
          700: 'hsl(32 85% 40% / <alpha-value>)',
        },

        // Semantic
        success: 'hsl(152 60% 40% / <alpha-value>)',
        warning: 'hsl(36 95% 56%  / <alpha-value>)',
        danger:  'hsl(354 70% 50% / <alpha-value>)',
        info:    'hsl(206 80% 50% / <alpha-value>)',

        // Graph nodes (deuteranopia + protanopia safe)
        node: {
          law:       'hsl(232 72% 52% / <alpha-value>)',
          article:   'hsl(36 95% 56%  / <alpha-value>)',
          reference: 'hsl(266 65% 60% / <alpha-value>)',
          amendment: 'hsl(195 70% 50% / <alpha-value>)',
          repealed:  'hsl(220 8% 55%  / <alpha-value>)',
        },

        // Soft tints — used for badge backgrounds in light theme
        'primary-soft': 'hsl(var(--primary-soft) / <alpha-value>)',
        'amber-soft':   'hsl(var(--amber-soft)   / <alpha-value>)',
        'success-soft': 'hsl(var(--success-soft) / <alpha-value>)',
        'danger-soft':  'hsl(var(--danger-soft)  / <alpha-value>)',
      },
      fontFamily: {
        // "* Variable" is the family name @fontsource-variable registers for the
        // self-hosted fonts (main.tsx); the plain name + system stack stay as
        // fallbacks for the brief moment before the woff2 loads.
        display: ['"Space Grotesk Variable"', '"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans:    ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // [size, { lineHeight, letterSpacing }]
        xs:   ['0.75rem',  { lineHeight: '1rem' }],
        sm:   ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem',     { lineHeight: '1.5rem' }],
        lg:   ['1.125rem', { lineHeight: '1.75rem' }],
        xl:   ['1.375rem', { lineHeight: '1.875rem', letterSpacing: '-0.01em' }],
        '2xl':['1.75rem',  { lineHeight: '2.25rem',  letterSpacing: '-0.01em' }],
        '3xl':['2.25rem',  { lineHeight: '2.625rem', letterSpacing: '-0.015em' }],
        '4xl':['3rem',     { lineHeight: '3.25rem',  letterSpacing: '-0.02em' }],
        '5xl':['3.75rem',  { lineHeight: '4rem',     letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        1: '0 1px 2px hsl(232 30% 10% / 0.06)',
        2: '0 8px 24px -8px hsl(232 30% 10% / 0.12)',
        3: '0 24px 56px -16px hsl(232 30% 10% / 0.20)',
      },
      maxWidth: {
        // Shared content-shell width (#831): caps page content on wide screens
        // so it neither floats with empty gutters nor over-stretches into
        // unreadable line lengths. `content` for dense grids/tables/pages,
        // `measure` for prose. Applied left-anchored (no `mx-auto`) so the
        // content's left edge lines up with the shell padding / breadcrumb.
        content: '80rem', // 1280px
        measure: '72ch',
      },
      spacing: {
        // Adds half-step values used by the spec
        '0.25': '0.0625rem',
        '0.75': '0.1875rem',
        '4.5':  '1.125rem', // 18px
      },
      keyframes: {
        in: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulse: { '0%, 100%': { opacity: '0.4' }, '50%': { opacity: '1' } },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        // `in` was a hand-rolled `.animate-in` shim (fade + 4px rise) written
        // back when `tailwindcss-animate` wasn't wired up yet. Now that the
        // plugin is registered below, IT owns the real `.animate-in` utility
        // (composable with `fade-in` / `slide-in-from-*` / `zoom-in-*` /
        // `duration-*`) — keeping this entry would define a same-named,
        // conflicting utility class. `layout` still uses the `in` keyframe.
        layout: 'in 200ms ease-in-out',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.2,.7,.3,1)',
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Tailwind's
  // config loader transpiles this file to CJS; `require()` is the standard way
  // to pull in plugins here (see shadcn/ui and the tailwindcss-animate docs).
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
} satisfies Config;
