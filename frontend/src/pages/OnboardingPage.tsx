import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { Button, Callout, Radio, Switch } from '@/components/ui';
import { useModels } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { cn } from '@/lib/utils';

/**
 * 3-step first-launch modal. Renders fullscreen; gate it behind a one-shot
 * localStorage flag at the App router level once you're happy with it.
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const { theme, setTheme, defaultModel, setDefaultModel } = useUi();
  const [telemetry, setTelemetry] = useState(false);
  const { data: models = [] } = useModels();

  const finish = () => {
    try { localStorage.setItem('lexflow.onboarded', '1'); } catch { /* private mode */ }
    navigate('/home');
  };

  return (
    <div className="flex h-full items-center justify-center bg-bg p-6">
      <div role="dialog" aria-labelledby="ob-title" className="w-[560px] max-w-full rounded-xl border border-border-strong bg-surface p-7 shadow-3">
        <header className="mb-4 flex items-center gap-2.5">
          <BrandMark />
          <span className="font-display text-base font-semibold">Bienvenida a LexFlow</span>
          <span className="ml-auto font-mono text-[12px] text-muted">{step} / 3</span>
        </header>

        <div className="mb-5 flex gap-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className={cn('h-1 flex-1 rounded', i <= step ? 'bg-indigo-500' : 'bg-surface-2')} />
          ))}
        </div>

        {step === 1 && (
          <>
            <h2 id="ob-title" className="mb-1 font-display text-2xl font-semibold">Elige tu tema</h2>
            <p className="mb-4 text-[13.5px] text-muted">
              Puedes alternar entre claro y oscuro en cualquier momento con <kbd className="font-mono">⌘ .</kbd>
            </p>
            <div className="flex gap-3">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    'flex-1 rounded-xl border-2 bg-bg p-4 text-left',
                    theme === t ? 'border-indigo-500' : 'border-border',
                  )}
                >
                  <div className="h-14 rounded-md border border-border" style={{ background: t === 'light' ? '#f5f5f9' : '#0f1120' }} />
                  <div className="mt-2 text-sm font-semibold">{t === 'light' ? 'Claro' : 'Oscuro'}</div>
                  <div className="mt-1 text-[12px] text-muted">
                    {t === 'light' ? 'Recomendado para juzgados y proyectores' : 'Recomendado para uso prolongado'}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="mb-1 font-display text-2xl font-semibold">Modelo de chat</h2>
            <p className="mb-4 text-[13.5px] text-muted">
              Elige un modelo por defecto. Los <strong>locales</strong> funcionan sin Internet; los de <strong>nube</strong> requieren clave API.
            </p>
            {models.slice(0, 4).map((m) => (
              <label
                key={m.id}
                className={cn(
                  'mb-1.5 flex items-center gap-3 rounded-lg border p-3 cursor-pointer',
                  defaultModel === m.id ? 'border-indigo-500 bg-primary-soft/50' : 'border-border bg-bg',
                )}
              >
                <Radio checked={defaultModel === m.id} onChange={() => setDefaultModel(m.id)} />
                <div className="flex-1">
                  <div className="font-semibold">{m.label}</div>
                  <div className="text-[12px] text-muted">{m.vendor}</div>
                </div>
                <span className={cn('inline-flex rounded-full px-2 py-px text-[11px] font-semibold', m.kind === 'local' ? 'bg-success-soft text-success' : 'bg-info/10 text-info')}>
                  {m.kind === 'local' ? 'local' : 'nube'}
                </span>
              </label>
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="mb-1 font-display text-2xl font-semibold">Telemetría</h2>
            <p className="mb-4 text-[13.5px] text-muted">
              Opcional. Si la activas, enviaremos métricas anónimas de uso (sin texto de consultas) para mejorar el producto.
            </p>
            <div className="flex items-center gap-3.5 rounded-xl border border-border bg-surface p-4">
              <Switch checked={telemetry} onChange={setTelemetry} label="Compartir métricas anónimas" />
              <span className="ml-auto text-[11.5px] text-muted">opt-in · desactivado por defecto</span>
            </div>
            <Callout tone="info" title="Qué no se envía" className="mt-4">
              Nunca enviamos el texto de tus búsquedas ni el contenido de tus chats. Sólo: cuáles pantallas usas, cuántos artículos abres por sesión, y errores.
            </Callout>
          </>
        )}

        <div className="mt-6 flex items-center gap-2">
          {step > 1 && <Button variant="ghost" icon={<ChevronLeft className="size-3.5" />} onClick={() => setStep(step - 1)}>Atrás</Button>}
          <span className="flex-1" />
          <Button variant="ghost" onClick={finish}>Omitir</Button>
          {step < 3 ? (
            <Button iconRight={<ChevronRight className="size-3.5" />} onClick={() => setStep(step + 1)}>Continuar</Button>
          ) : (
            <Button icon={<Check className="size-3.5" />} onClick={finish}>Empezar a usar LexFlow</Button>
          )}
        </div>
      </div>
    </div>
  );
}
