import { cn } from '@/lib/utils';

export interface RadioProps {
  checked: boolean;
  onChange?: () => void;
  label?: React.ReactNode;
  disabled?: boolean;
  name?: string;
}

export function Radio({ checked, onChange, label, disabled, name }: RadioProps) {
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-2 text-[13px]', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        type="button"
        role="radio"
        name={name}
        aria-checked={checked}
        onClick={() => !disabled && onChange?.()}
        className={cn(
          'inline-flex size-4 items-center justify-center rounded-full border bg-surface transition-colors',
          checked ? 'border-indigo-600' : 'border-border-strong',
        )}
      >
        {checked && <span className="size-2 rounded-full bg-indigo-600" />}
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}
