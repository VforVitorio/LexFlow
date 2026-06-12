import { useCallback, useState } from 'react';

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
 */
export function useEdgeResize(edge: RailEdge, setWidth: (px: number) => void) {
  const [dragging, setDragging] = useState(false);

  const widthFromPointer = useCallback(
    (clientX: number) => (edge === 'left' ? clientX : window.innerWidth - clientX),
    [edge],
  );

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(true);
      const onMove = (ev: PointerEvent) => setWidth(widthFromPointer(ev.clientX));
      const onUp = () => {
        setDragging(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [setWidth, widthFromPointer],
  );

  return { dragging, startDrag };
}
