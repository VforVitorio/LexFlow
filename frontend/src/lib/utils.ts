import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Conditional + merged Tailwind class string. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Audit #409 perf: ``Intl.DateTimeFormat`` / ``NumberFormat`` /
// ``RelativeTimeFormat`` constructors were called per render — 200-400
// per Explorer paint when each row formats its own date. Hoisting the
// formatters keeps a single per-locale instance alive for the page
// lifetime; the formatters are stateless so sharing is safe.
const DATE_FMT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const NUMBER_FMT = new Intl.NumberFormat('es-ES');
const RELATIVE_TIME_FMT = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });

/** Format an ISO date as e.g. "11 may 2023". */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return DATE_FMT.format(new Date(iso));
  } catch { return iso; }
}

export function formatNumber(n: number): string {
  return NUMBER_FMT.format(n);
}

/** Distance-from-now in human Spanish ("hace 14 minutos"). */
export function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  const rtf = RELATIVE_TIME_FMT;
  if (diff < 60) return rtf.format(-Math.round(diff), 'second');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  return formatDate(iso);
}

/** Group an array by a key function. */
export function groupBy<T, K extends string>(arr: T[], key: (item: T) => K): Record<K, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

/** Detect the macOS modifier label so we can show ⌘ vs Ctrl correctly. */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';

/** Localise a status enum value. */
export function statusLabel(status: string): string {
  return ({
    vigente: 'Vigente',
    modificada: 'Modificada',
    derogada: 'Derogada',
    pendiente: 'Pendiente',
  } as Record<string, string>)[status] || status;
}
