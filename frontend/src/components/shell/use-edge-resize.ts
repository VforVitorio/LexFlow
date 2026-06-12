import { useCallback, useEffect, useRef, useState } from 'react';

export type RailEdge = 'left' | 'right';

/**
 * Pointer drag-resize for a rail docked to a viewport edge (#594).
 *
 * `edge` is the side of the VIEWPORT the rail is docked to. A left-docked
 * rail's width is the pointer's `clientX`; a right-docked rail's width is the
 * distance from the pointer to the right viewport edge. The `setWidth` setter
 * is expected to clamp — we feed it the raw px. While dragging we suppress
 * text selection and force a col-resize cursor document-wide so the gesture
 * feels native.
 *
 * Returns `dragging` so the parent can drop its width transition mid-drag
 * (otherwise the rail lags a frame behind the pointer).
 *
 * Cleanup is centralised in one `finish` closure wired to `pointerup` AND
 * `pointercancel` (touch interruptions), and stashed in a ref so an unmount
 * mid-drag tears the global listeners + `document.body` style overrides down
 * too — otherwise a cancelled drag could leave the whole page stuck with
 * `user-select: none` and a col-resize cursor.
 */
export function useEdgeResize(edge: RailEdge, setWidth: (px: number) => void) {
  const [dragging, setDragging] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(true);
      const onMove = (ev: PointerEvent) => {
        setWidth(edge === 'left' ? ev.clientX : window.innerWidth - ev.clientX);
      };
      const finish = () => {
        setDragging(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        cleanupRef.current = null;
      };
      cleanupRef.current = finish;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [setWidth, edge],
  );

  // Tear down a drag still in flight when the rail unmounts.
  useEffect(() => () => cleanupRef.current?.(), []);

  return { dragging, startDrag };
}
