import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Trap keyboard focus inside `containerRef` while `active`.
 *
 * On activate it remembers the previously-focused element and pulls focus
 * into the container if it isn't already there; Tab / Shift+Tab then wrap
 * around the container's focusable children instead of escaping to the
 * inert page behind a modal. On deactivate (or unmount) focus is restored
 * to wherever it was before the modal opened.
 *
 * The project hand-rolls every modal (no Radix `FocusScope`), so this hook
 * is the single source of trap behaviour shared by CommandPalette and
 * ConfirmDialog. a11y #714 (P0: CommandPalette let Tab escape behind it).
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const visibleFocusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Some modals focus their own control (CommandPalette focuses its input
    // via rAF); only pull focus in when nothing inside is focused yet.
    if (!container.contains(document.activeElement)) {
      visibleFocusables()[0]?.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = visibleFocusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !container.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef]);
}
