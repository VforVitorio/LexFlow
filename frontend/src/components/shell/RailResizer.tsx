import { cn } from '@/lib/utils';
import type { RailEdge } from './use-edge-resize';

// Keyboard nudge step for the resize separators (#594). Matches the 8px
// rhythm the rest of the shell snaps to.
const RESIZE_KEY_STEP = 8;

interface RailResizerProps {
  edge: RailEdge;
  /** Current width — for the ARIA value and arrow-key nudging. */
  width: number;
  /** Clamping setter from the UI store. */
  setWidth: (px: number) => void;
  min: number;
  max: number;
  label: string;
  /** From {@link useEdgeResize}, lifted to the parent for the transition. */
  dragging: boolean;
  startDrag: (e: React.PointerEvent) => void;
}

/**
 * A thin, draggable + keyboard-nudgeable separator on a rail's inner edge.
 *
 * The parent must be `position: relative`; this absolutely positions itself
 * against `edge` (a 2px hot zone with a 1px accent line that lights up on
 * hover/focus/drag).
 */
export function RailResizer({ edge, width, setWidth, min, max, label, dragging, startDrag }: RailResizerProps) {
  const nudge = (e: React.KeyboardEvent) => {
    // On a left-docked rail, ArrowRight grows it; on a right-docked rail the
    // mapping flips so "toward the viewport edge" always grows.
    const grow = edge === 'left' ? RESIZE_KEY_STEP : -RESIZE_KEY_STEP;
    if (e.key === 'ArrowRight') setWidth(width + grow);
    else if (e.key === 'ArrowLeft') setWidth(width - grow);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={startDrag}
      onKeyDown={nudge}
      className={cn(
        'group absolute top-0 z-10 h-full w-2 cursor-col-resize touch-none focus-visible:outline-none',
        edge === 'left' ? 'right-0' : 'left-0',
      )}
    >
      <span
        className={cn(
          'absolute top-0 h-full w-px transition-colors',
          edge === 'left' ? 'right-0' : 'left-0',
          dragging
            ? 'bg-indigo-500'
            : 'bg-transparent group-hover:bg-indigo-500/50 group-focus-visible:bg-indigo-500/70',
        )}
      />
    </div>
  );
}
