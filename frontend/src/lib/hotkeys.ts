import { useEffect, useRef } from 'react';

type Handler = (e: KeyboardEvent) => void;

/**
 * Register a single hotkey. Combos like "mod+k", "mod+/", "mod+." and
 * single keys like "/", "?", "Escape" are supported. Two-key prefixes
 * (e.g. "g e") use the `useGoToHotkey` helper below.
 *
 * Ignores keydown when focus is in an input / textarea / contenteditable,
 * unless the combo includes a modifier (so ⌘K still fires there).
 */
export function useHotkey(combo: string, handler: Handler, deps: unknown[] = []) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!matches(combo, e)) return;
      const t = e.target as HTMLElement | null;
      const inField =
        t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      const hasMod = /(mod|ctrl|meta|alt|shift)\+/i.test(combo);
      if (inField && !hasMod) return;
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function matches(combo: string, e: KeyboardEvent): boolean {
  const parts = combo.toLowerCase().split('+').map((s) => s.trim());
  const key = parts[parts.length - 1];
  const needMod = parts.includes('mod') || parts.includes('cmd') || parts.includes('ctrl') || parts.includes('meta');
  const needShift = parts.includes('shift');
  const needAlt = parts.includes('alt');
  const eKey = e.key.toLowerCase();
  const eMod = e.metaKey || e.ctrlKey;
  if (needMod !== eMod) return false;
  if (needShift !== e.shiftKey) return false;
  if (needAlt !== e.altKey) return false;
  return eKey === key;
}

/**
 * Two-key sequence prefixed by "g" (go-to navigation map).
 * E.g. useGoToHotkey({ h: () => navigate('/'), e: () => navigate('/explorer') }).
 * The prefix resets after 800ms or any other key press.
 */
export function useGoToHotkey(map: Record<string, () => void>) {
  const ref = useRef<{ prefix: boolean; t: number }>({ prefix: false, t: 0 });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const now = Date.now();
      if (ref.current.prefix && now - ref.current.t < 800) {
        const fn = map[e.key.toLowerCase()];
        if (fn) { e.preventDefault(); fn(); }
        ref.current.prefix = false;
        return;
      }
      if (e.key.toLowerCase() === 'g') {
        ref.current = { prefix: true, t: now };
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map]);
}
