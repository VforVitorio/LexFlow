import { cn } from '@/lib/utils';

export interface SwitchProps {
  checked: boolean;
  onChange?: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onChange, label, disabled, id }: SwitchProps) {
  return (
    <label htmlFor={id} className={cn('inline-flex cursor-pointer select-none items-center gap-2 text-[13px]', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange?.(!checked)}
        className={cn(
          'relative inline-flex h-[18px] w-8 items-center rounded-full border transition-colors',
          checked ? 'bg-indigo-600 border-transparent' : 'bg-surface-2 border-border-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-px size-3.5 rounded-full bg-white shadow-1 transition-transform',
            checked ? 'translate-x-[15px]' : 'translate-x-px',
          )}
        />
      </button>
      {label}
    </label>
  );
}
