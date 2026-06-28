import { createContext, useContext } from 'react';

/**
 * Context + hook for the promise-based confirmation modal.
 *
 * Split out of `ConfirmDialog.tsx` so that file stays component-only and
 * keeps Fast Refresh happy (same split convention as the editor's custom
 * nodes — definitions in `.ts`, components in `.tsx`).
 */
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
}

export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Returns a `confirm(opts) => Promise<boolean>` callback. Resolves true on accept. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx;
}
