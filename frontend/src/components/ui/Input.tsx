import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, trailing, error, className, ...rest }, ref) => (
    <div className={cn(
      'inline-flex h-9 items-center gap-2 rounded-md border bg-surface px-3 text-fg transition-colors',
      'focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-1 focus-within:ring-offset-bg',
      error ? 'border-danger' : 'border-border-strong',
      className,
    )}>
      {icon && <span className="text-muted">{icon}</span>}
      <input
        ref={ref}
        className="h-full flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted"
        {...rest}
      />
      {trailing}
    </div>
  )
);
Input.displayName = 'Input';
