import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  active?: boolean;
  dismissable?: boolean;
  onDismiss?: () => void;
  onClick?: () => void;
  icon?: React.ReactNode;
}

export function Chip({ active, dismissable, onDismiss, icon, className, children, onClick, ...rest }: ChipProps) {
  const base = cn(
    'inline-flex h-7 items-center gap-1.5 rounded-full text-[12.5px] font-medium transition-colors',
    active
      ? 'bg-indigo-600 text-white border border-transparent hover:bg-indigo-700'
      : 'bg-surface text-fg border border-border-strong hover:bg-surface-2',
    className,
  );

  // When the chip carries its own dismiss action we cannot nest a second
  // interactive control inside the main <button> (invalid HTML, breaks
  // keyboard focus). Render the body and the dismiss affordance as
  // siblings inside a non-interactive wrapper instead.
  if (dismissable) {
    return (
      <span className={cn(base, 'pl-2.5 pr-1')}>
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1.5 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
          {...rest}
        >
          {icon}
          {children}
        </button>
        <button
          type="button"
          aria-label="quitar filtro"
          onClick={(e) => { e.stopPropagation(); onDismiss?.(); }}
          className="ml-1 flex rounded p-0.5 opacity-70 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-indigo-400 outline-none"
        >
          <X className="size-3" />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(base, 'px-2.5')}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
