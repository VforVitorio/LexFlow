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
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition-colors',
        active
          ? 'bg-indigo-600 text-white border border-transparent hover:bg-indigo-700'
          : 'bg-surface text-fg border border-border-strong hover:bg-surface-2',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {dismissable && (
        <span
          role="button"
          aria-label="quitar filtro"
          onClick={(e) => { e.stopPropagation(); onDismiss?.(); }}
          className="ml-1 -mr-1 flex opacity-70 hover:opacity-100"
        >
          <X className="size-3" />
        </span>
      )}
    </button>
  );
}
