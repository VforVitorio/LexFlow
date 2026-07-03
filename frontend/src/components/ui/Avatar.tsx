import { cn } from '@/lib/utils';

type Tone = 'indigo' | 'amber' | 'violet' | 'cyan';

const avatarTones: Record<Tone, string> = {
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200',
  amber:  'bg-amber-soft text-amber-700 dark:text-amber-300',
  // Deslop #798: violet/cyan tints were copy-pasted arbitrary HSL values —
  // now sourced from the shared --reference-soft/--amendment-soft(-fg) tokens
  // (index.css), which already flip light/dark, so no `dark:` variant needed.
  violet: 'bg-[hsl(var(--reference-soft))] text-[hsl(var(--reference-soft-fg))]',
  cyan:   'bg-[hsl(var(--amendment-soft))] text-[hsl(var(--amendment-soft-fg))]',
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
