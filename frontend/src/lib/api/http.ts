/**
 * HTTP plumbing shared by every resource module under `lib/api/*`.
 *
 * Keeping this small + dependency-free is on purpose — the resource
 * modules depend only on this file (not on the rest of the API
 * surface), so we can refactor any resource in isolation without
 * touching transport.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Backend host/prefix     → ``API_BASE`` / ``API_PREFIX`` constants.
 * Auth header / cookies   → extend ``http()`` here, not at call sites.
 * Error shape from server → ``ApiError.detail`` (FastAPI ``{detail}``).
 */

/** Allow consumers (Settings page) to read whether we're on mock. */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
export const API_BASE = import.meta.env.VITE_API_URL || '';
export const API_PREFIX = '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string,
  ) {
    super(message || `API ${status}`);
  }

  /** Reads FastAPI's `{ detail }` if present; falls back to the message. */
  get detail(): string {
    if (this.body && typeof this.body === 'object' && 'detail' in this.body) {
      const d = (this.body as { detail: unknown }).detail;
      if (typeof d === 'string') return d;
    }
    return this.message;
  }
}

/** Typed fetch helper that throws `ApiError` on non-2xx + parses JSON.
 *
 * Content-Type rule: the JSON default is dropped automatically when the
 * caller passes a ``FormData`` body so the browser can set the correct
 * multipart boundary. Without this guard the multipart upload reaches
 * the backend with ``Content-Type: application/json`` and FastAPI
 * fails to parse the boundary. Same logic applies to ``URLSearchParams``
 * and ``Blob`` bodies.
 */
export async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const full = path.startsWith('http') ? path : `${API_BASE}${API_PREFIX}${path}`;
  const body = init.body;
  const isStructured = body instanceof FormData || body instanceof URLSearchParams || body instanceof Blob;
  const baseHeaders: Record<string, string> = { Accept: 'application/json' };
  if (!isStructured) baseHeaders['Content-Type'] = 'application/json';
  const res = await fetch(full, {
    ...init,
    headers: {
      ...baseHeaders,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    let body: unknown = undefined;
    try {
      body = await res.json();
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, body, `${init.method || 'GET'} ${path}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Build a `?key=value&key=value` query string, skipping nullish/empty values
 * and serialising arrays as repeated keys. Returns `''` when no params apply.
 */
export function qs(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, String(x)));
    else u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}
