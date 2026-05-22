import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge, Kbd } from '@/components/ui';
import { useModels } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { cn } from '@/lib/utils';

export function ModelChip() {
  const { defaultModel, setDefaultModel } = useUi();
  const { data: models = [] } = useModels();
  const [open, setOpen] = useState(false);

  const m = models.find((x) => x.id === defaultModel) ?? models[0];
  if (!m) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-2 rounded-lg border border-border-strong bg-surface px-2.5 text-[13px] hover:bg-surface-2"
      >
        <span className="font-medium">{m.label}</span>
        <Badge tone={m.kind === 'local' ? 'success' : 'info'}>{m.kind === 'local' ? 'local' : 'nube'}</Badge>
        <ChevronDown className="size-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[240px] rounded-lg border border-border-strong bg-surface p-1 shadow-3">
            {models.map((opt) => (
              <button
                key={opt.id}
                disabled={!opt.available}
                onClick={() => { setDefaultModel(opt.id); setOpen(false); }}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2.5 py-2 text-[13px] transition-colors',
                  opt.id === m.id ? 'bg-primary-soft' : 'hover:bg-surface-2',
                  !opt.available && 'opacity-50 cursor-not-allowed',
                )}
              >
                <div className="flex-1 text-left">
                  <div className={cn('font-medium', opt.id === m.id && 'font-semibold')}>{opt.label}</div>
                  <div className="text-[11.5px] text-muted">{opt.vendor}{!opt.available && ' · sin configurar'}</div>
                </div>
                <Badge tone={opt.kind === 'local' ? 'success' : 'info'}>{opt.kind === 'local' ? 'local' : 'nube'}</Badge>
              </button>
            ))}
            <div className="mt-1 border-t border-border px-2.5 pt-2 pb-1 text-[11px] text-muted">
              Cambia modelos en <Kbd>Ajustes › Modelos</Kbd>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
