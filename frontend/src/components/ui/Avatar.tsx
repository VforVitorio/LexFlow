import { cn } from '@/lib/utils';

type Tone = 'indigo' | 'amber' | 'violet' | 'cyan';

const avatarTones: Record<Tone, string> = {
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200',
  amber:  'bg-amber-soft text-amber-700 dark:text-amber-300',
  violet: 'bg-[hsl(266_65%_92%)] text-[hsl(266_50%_35%)] dark:bg-[hsl(266_30%_22%)] dark:text-[hsl(266_60%_80%)]',
  cyan:   'bg-[hsl(195_70%_92%)] text-[hsl(195_70%_28%)] dark:bg-[hsl(195_30%_22%)] dark:text-[hsl(195_50%_80%)]',
};

export function Avatar({
  initials, size = 28, tone = 'indigo', className,
}: { initials: string; size?: number; tone?: Tone; className?: string }) {
  return (
    <div
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold font-display tracking-tight', avatarTones[tone], className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials}
    </div>
  );
}
