import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  padded?: boolean;
}

export function Card({ hoverable, padded = true, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface transition-colors',
        padded && 'p-4',
        hoverable && 'cursor-pointer hover:border-border-strong hover:bg-surface-2/50',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
