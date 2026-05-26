/**
 * Tiny toast store + helpers (issue #88).
 *
 * Zustand-backed because:
 *   * Toasts are ephemeral client-only state — no server round-trip,
 *     so TanStack Query is the wrong tool.
 *   * Different from the persisted ``useUi`` store: toasts must never
 *     survive a reload (a stale "server down" toast on Monday morning
 *     would be confusing). Lives in its own module to keep that line
 *     explicit.
 *
 * Usage from a component:
 *   const push = useToast((s) => s.push);
 *   push({ tone: 'danger', title: 'Something broke', message: err.detail });
 *
 * The :mod:`@/components/shell/Toaster` (mounted once at the app root)
 * subscribes and renders the stack.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Toast visuals  → ``Toaster`` component
 * * Auto-dismiss   → ``DEFAULT_TTL_MS`` below
 * * Cap visible    → ``MAX_VISIBLE`` below
 */

import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: string;
  tone: ToastTone;
  title?: string;
  message: string;
  /** Override the default TTL (ms). Pass `0` to make the toast sticky. */
  ttlMs?: number;
}

/** Default auto-dismiss window (ms). Long enough to read a sentence, short
 *  enough that a wall of stale toasts doesn't pile up. */
const DEFAULT_TTL_MS = 6_000;

/** Cap the rendered stack so a noisy backend can't flood the viewport.
 *  Older toasts fall off the bottom; the store keeps the most recent N. */
const MAX_VISIBLE = 5;

interface ToastState {
  toasts: Toast[];
  push(toast: Omit<Toast, 'id'>): string;
  dismiss(id: string): void;
  clear(): void;
}

let _seq = 0;
const _nextId = () => `t-${++_seq}-${Date.now().toString(36)}`;

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  push(input) {
    const id = _nextId();
    const toast: Toast = { ...input, id };
    set((state) => ({ toasts: [...state.toasts, toast].slice(-MAX_VISIBLE) }));
    const ttl = input.ttlMs ?? DEFAULT_TTL_MS;
    if (ttl > 0) {
      // setTimeout is fine — toasts are short-lived and the closure
      // captures `id`, not the entire store reference.
      window.setTimeout(() => get().dismiss(id), ttl);
    }
    return id;
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  clear() {
    set({ toasts: [] });
  },
}));

/**
 * Imperative façade for places that can't easily call a hook (the
 * TanStack Query global ``onError`` handler runs outside React).
 * Mirrors the hook's `push` signature.
 */
export function toast(input: Omit<Toast, 'id'>): string {
  return useToast.getState().push(input);
}
