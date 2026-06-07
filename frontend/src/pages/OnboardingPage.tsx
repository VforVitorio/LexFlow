import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  // Audit #409 — read setTelemetryConsent so the opt-in toggle the
  // user flicks during onboarding actually lands in the persisted
  // store. Previously the local `telemetry` state was discarded on
  // `finish()` and Settings → Privacidad still reported "off" after
  // the user enabled it during onboarding.
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const defaultModel = useUi((s) => s.defaultModel);
  const setDefaultModel = useUi((s) => s.setDefaultModel);
  const telemetryConsent = useUi((s) => s.telemetryConsent);
  const setTelemetryConsent = useUi((s) => s.setTelemetryConsent);
  const [telemetry, setTelemetry] = useState(telemetryConsent);
  const { data: models = [] } = useModels();

  const finish = () => {
    setTelemetryConsent(telemetry);
    try { localStorage.setItem('lexflow.onboarded', '1'); } catch { /* private mode */ }
    navigate('/home');
  };

  return (
    <div className="flex h-full items-center justify-center bg-bg p-6">
      <div role="dialog" aria-labelledby="ob-title" className="w-[560px] max-w-full rounded-xl border border-border-strong bg-surface p-7 shadow-3">
        <header className="mb-4 flex items-center gap-2.5">
          <BrandMark />
          <span className="font-display text-base font-semibold">{t('onboarding.welcome')}</span>
          <span className="ml-auto font-mono text-[12px] text-muted">{step} / 3</span>
        </header>

        <div className="mb-5 flex gap-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className={cn('h-1 flex-1 rounded', i <= step ? 'bg-indigo-500' : 'bg-surface-2')} />
          ))}
        </div>

        {step === 1 && (
          <>
            <h2 id="ob-title" className="mb-1 font-display text-2xl font-semibold">{t('onboarding.step1.title')}</h2>
            <p className="mb-4 text-[13.5px] text-muted">
              {t('onboarding.step1.body')} <kbd className="font-mono">⌘ .</kbd>
            </p>
            <div className="flex gap-3">
              {(['light', 'dark'] as const).map((theme_) => (
                <button
                  key={theme_}
                  onClick={() => setTheme(theme_)}
                  className={cn(
                    'flex-1 rounded-xl border-2 bg-bg p-4 text-left',
                    theme === theme_ ? 'border-indigo-500' : 'border-border',
                  )}
                >
                  <div className="h-14 rounded-md border border-border" style={{ background: theme_ === 'light' ? '#f5f5f9' : '#0f1120' }} />
                  <div className="mt-2 text-sm font-semibold">{theme_ === 'light' ? t('onboarding.theme.light') : t('onboarding.theme.dark')}</div>
                  <div className="mt-1 text-[12px] text-muted">
                    {theme_ === 'light' ? t('onboarding.theme.lightDesc') : t('onboarding.theme.darkDesc')}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="mb-1 font-display text-2xl font-semibold">{t('onboarding.step2.title')}</h2>
            {/* Static translator copy only (two <strong> spans) — safe to
                render as HTML; same pattern as settings.personalization.a11yBody. */}
            <p className="mb-4 text-[13.5px] text-muted" dangerouslySetInnerHTML={{ __html: t('onboarding.step2.body') }} />
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
                  {m.kind === 'local' ? t('onboarding.modelKind.local') : t('onboarding.modelKind.cloud')}
                </span>
              </label>
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="mb-1 font-display text-2xl font-semibold">{t('onboarding.step3.title')}</h2>
            <p className="mb-4 text-[13.5px] text-muted">
              {t('onboarding.step3.body')}
            </p>
            <div className="flex items-center gap-3.5 rounded-xl border border-border bg-surface p-4">
              <Switch checked={telemetry} onChange={setTelemetry} label={t('onboarding.step3.shareMetrics')} />
              <span className="ml-auto text-[11.5px] text-muted">{t('onboarding.step3.optIn')}</span>
            </div>
            <Callout tone="info" title={t('onboarding.step3.notSentTitle')} className="mt-4">
              {t('onboarding.step3.notSentBody')}
            </Callout>
          </>
        )}

        <div className="mt-6 flex items-center gap-2">
          {step > 1 && <Button variant="ghost" icon={<ChevronLeft className="size-3.5" />} onClick={() => setStep(step - 1)}>{t('onboarding.back')}</Button>}
          <span className="flex-1" />
          <Button variant="ghost" onClick={finish}>{t('onboarding.skip')}</Button>
          {step < 3 ? (
            <Button iconRight={<ChevronRight className="size-3.5" />} onClick={() => setStep(step + 1)}>{t('onboarding.continue')}</Button>
          ) : (
            <Button icon={<Check className="size-3.5" />} onClick={finish}>{t('onboarding.start')}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
