import { cn } from '@/lib/utils';
import { Check, Minus } from 'lucide-react';

export interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange?: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}

export function Checkbox({ checked, indeterminate, onChange, label, disabled }: CheckboxProps) {
  const on = checked || indeterminate;
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-2 text-[13px]', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        onClick={() => !disabled && onChange?.(!checked)}
        className={cn(
          'inline-flex size-4 items-center justify-center rounded border text-white transition-colors',
          on ? 'bg-indigo-600 border-transparent' : 'bg-surface border-border-strong',
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
        {!checked && indeterminate && <Minus className="size-3" strokeWidth={3} />}
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}
