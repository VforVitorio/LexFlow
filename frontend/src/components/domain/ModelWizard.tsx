/**
 * Model wizard — three-step onboarding flow (#118).
 *
 * Shown right after WelcomeFlow on first launch (and re-launchable from
 * Settings → Modelos). Walks the user through:
 *
 *   1. Detect hardware via `useSystemProfile` (#117). 6-line summary
 *      with re-detect button.
 *   2. Pick one of the four tiers. Pre-selects the largest that fits
 *      comfortably; every card is annotated with a fit verdict in the
 *      shared 5-status vocabulary ("Va sobrado" / "Va bien" / "Va
 *      decente" / "Justo justo" / "Demasiado pesado").
 *   3. Confirm + install. For local tiers, show the exact `ollama pull`
 *      command to run in a terminal (with copy button + auto-verify
 *      against `ollama_models` once detection is re-run). For the
 *      cloud tier, point the user at Settings → Modelos to paste their
 *      API key.
 *
 * The wizard never installs models itself in this PR — that needs an
 * SSE pull endpoint (`POST /api/v1/models/pull`), which is tracked as a
 * follow-up because it touches Ollama-CLI semantics and deserves its
 * own PR.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Tier catalog + thresholds → `lib/model-tiering.ts`.
 * SPA-wide first-launch order → `main.tsx` (gate stacking).
 * Re-launch entrypoint → `pages/SettingsPage.tsx → ModelsSection`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Cloud,
  Cpu,
  Download,
  HardDrive,
  RefreshCw,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';

import { Badge, Button } from '@/components/ui';
import { Skeleton } from '@/components/domain/Skeleton';
import { api } from '@/lib/api';
import { liveSecretsApi } from '@/lib/api/secrets';
import {
  FIT_LABELS,
  FIT_TONES,
  TIER_CATALOG,
  fitForModel,
  recommendTier,
  type FitStatus,
  type ModelTier,
  type TierKey,
} from '@/lib/model-tiering';
import { useSystemProfile } from '@/lib/queries';
import { toast } from '@/lib/toast';
import type { SystemProfile } from '@/lib/types';
import { cn } from '@/lib/utils';

export const WIZARD_COMPLETED_STORAGE_KEY = 'lexflow.wizard-completed';
export const PREFERRED_MODEL_STORAGE_KEY = 'lexflow.preferred-model';

type Step = 1 | 2 | 3;

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Render-prop gate. Shows the wizard before children whenever the user
 * hasn't completed it yet. Mirrors the WelcomeFlow gate pattern so the
 * `main.tsx` stack stays uniform: SplashGate → WelcomeFlow → ModelWizardGate
 * → App.
 */
export function ModelWizardGate({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(() => !readWizardCompleted());

  if (!open) return <>{children}</>;

  return (
    <>
      {children}
      <ModelWizard
        onComplete={() => {
          markWizardCompleted();
          setOpen(false);
        }}
        onSkip={() => {
          // "Saltar" (X button) doesn't mark the wizard as completed — it
          // stays available from Settings. We close the modal for this
          // session via a separate storage key.
          markWizardSkipped();
          setOpen(false);
        }}
        onLater={() => {
          // "Lo haré más tarde" (footer button) permanently marks the wizard
          // done without persisting a model choice — leaves the chat in
          // "no model configured" state until the user visits Settings → Modelos.
          markWizardCompleted();
          setOpen(false);
        }}
      />
    </>
  );
}

/**
 * Standalone wizard (no gate). Used by the "Volver a lanzar wizard"
 * button in Settings → Modelos, where the parent owns the open state.
 *
 * Props:
 *   onComplete   — model chosen + persisted; wizard is done.
 *   onSkip       — X button: session-only dismiss (wizard reappears next launch).
 *   onLater      — "Lo haré más tarde" footer button: marks wizard permanently
 *                  done WITHOUT persisting a model choice (user sets up in Settings).
 */
export function ModelWizard({
  onComplete,
  onSkip,
  onLater,
}: {
  onComplete: (tier: TierKey) => void;
  onSkip: () => void;
  onLater: () => void;
}) {
  const { t } = useTranslation();
  const profileQuery = useSystemProfile();
  const [step, setStep] = useState<Step>(1);
  const [selectedKey, setSelectedKey] = useState<TierKey | null>(null);
  // #672 — for cloud tiers: true only once the Anthropic key is confirmed present.
  const [cloudKeyReady, setCloudKeyReady] = useState(false);

  // Once the profile loads, pre-select the recommended tier. Re-runs
  // when refetch returns new data, but only if the user hasn't picked
  // one manually yet.
  useEffect(() => {
    if (profileQuery.data && selectedKey === null) {
      setSelectedKey(recommendTier(profileQuery.data));
    }
  }, [profileQuery.data, selectedKey]);

  const profile = profileQuery.data ?? null;
  const selectedTier =
    TIER_CATALOG.find((t) => t.key === selectedKey) ?? TIER_CATALOG[0];

  const stepCount = 3;
  const goBack = () => setStep((s) => Math.max(1, s - 1) as Step);
  const goNext = () => setStep((s) => Math.min(stepCount, s + 1) as Step);

  const finish = () => {
    // #672 — cloud tiers are only usable once the API key is in place.
    // Guard: if the user somehow reaches finish on a cloud tier without a
    // key (shouldn't happen with the disabled button, but belt-and-braces),
    // skip the "configured" toast and don't persist the model choice.
    if (selectedTier.cloud && !cloudKeyReady) {
      onComplete(selectedTier.key);
      return;
    }
    persistPreferredModel(selectedTier);
    toast({ tone: 'success', title: t('wizard.configuredToast'), message: selectedTier.model });
    onComplete(selectedTier.key);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('wizard.dialogAria')}
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/35 backdrop-blur-md p-4"
    >
      <div className="air-glass-strong w-full max-w-2xl p-7 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <WizardHeader step={step} stepCount={stepCount} onSkip={onSkip} />

        {step === 1 && (
          <StepDetect profile={profile} loading={profileQuery.isLoading} onRefetch={profileQuery.refetch} />
        )}
        {step === 2 && profile && (
          <StepPick profile={profile} selectedKey={selectedTier.key} onSelect={setSelectedKey} />
        )}
        {step === 3 && (
          <StepConfirm
            tier={selectedTier}
            profile={profile}
            onRefetchProfile={profileQuery.refetch}
            onCloudKeyChange={setCloudKeyReady}
          />
        )}

        <WizardFooter
          step={step}
          tier={selectedTier}
          profileReady={!!profile}
          cloudKeyReady={cloudKeyReady}
          onBack={goBack}
          onNext={goNext}
          onFinish={finish}
          onLater={onLater}
        />
      </div>
    </div>
  );
}

// ─── Header + footer ─────────────────────────────────────────────────────

function WizardHeader({ step, stepCount, onSkip }: { step: Step; stepCount: number; onSkip: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <div className="label-caps text-muted">{t('wizard.stepOf', { step, total: stepCount })}</div>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          {step === 1 && t('wizard.step1Title')}
          {step === 2 && t('wizard.step2Title')}
          {step === 3 && t('wizard.step3Title')}
        </h2>
      </div>
      <button
        type="button"
        onClick={onSkip}
        aria-label={t('wizard.closeAria')}
        className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function WizardFooter({
  step,
  tier,
  profileReady,
  cloudKeyReady,
  onBack,
  onNext,
  onFinish,
  onLater,
}: {
  step: Step;
  tier: ModelTier;
  profileReady: boolean;
  /** #672 — true once the Anthropic key is confirmed present (cloud tiers only). */
  cloudKeyReady: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
  /** #673 — permanently marks wizard done without a model; user finishes in Settings. */
  onLater: () => void;
}) {
  const { t } = useTranslation();
  const isLast = step === 3;

  // #672: the primary "Usar" button on the final cloud step is disabled
  // until the API key is confirmed — prevents the false "Modelo configurado"
  // success state from firing on bare selection.
  const finishDisabled = isLast && tier.cloud && !cloudKeyReady;

  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {step > 1 ? (
          <Button variant="ghost" onClick={onBack}>
            {t('wizard.back')}
          </Button>
        ) : (
          <span />
        )}
        {/* #673 — "Lo haré más tarde": permanently completes the wizard
            without configuring a model. Shown from step 2 onwards so the
            user always has an escape that doesn't trap them in the flow. */}
        {step >= 2 && (
          <Button variant="ghost" onClick={onLater} className="text-muted text-[13px]">
            {t('wizard.skipLater')}
          </Button>
        )}
      </div>
      <Button
        variant="primary"
        onClick={isLast ? onFinish : onNext}
        disabled={(step === 1 && !profileReady) || finishDisabled}
      >
        {isLast ? t('wizard.use', { tier: tier.title.split(' — ')[0].toLowerCase() }) : t('wizard.continue')}
      </Button>
    </div>
  );
}

// ─── Step 1 — Detect ─────────────────────────────────────────────────────

function StepDetect({
  profile,
  loading,
  onRefetch,
}: {
  profile: SystemProfile | null;
  loading: boolean;
  onRefetch: () => void;
}) {
  const { t } = useTranslation();
  if (loading || !profile) {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-2/3" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <DetectRow icon={<HardDrive className="size-3.5" />} label="RAM" value={t('wizard.ramValue', { total: profile.totalRamGb, free: profile.availableRamGb })} />
      <DetectRow icon={<Cpu className="size-3.5" />} label="CPU" value={t('wizard.cpuValue', { cores: profile.cpuCores })} />
      <DetectRow
        icon={<Sparkles className="size-3.5" />}
        label="GPU"
        value={
          profile.hasNvidiaGpu && profile.vramGb
            ? t('wizard.gpuNvidia', { name: profile.gpuName ?? 'NVIDIA', vram: profile.vramGb })
            : profile.isAppleSilicon
              ? t('wizard.gpuApple')
              : t('wizard.gpuNone')
        }
      />
      <DetectRow
        icon={<Cpu className="size-3.5" />}
        label={t('wizard.platformLabel')}
        value={profile.platform}
      />
      <DetectRow
        icon={profile.ollamaRunning ? <CheckCircle2 className="size-3.5 text-success" /> : <XCircle className="size-3.5 text-muted" />}
        label="Ollama"
        value={
          profile.ollamaRunning
            ? t('wizard.ollamaRunning', { count: profile.ollamaModels.length })
            : t('wizard.notDetected')
        }
      />
      <DetectRow
        icon={profile.lmstudioRunning ? <CheckCircle2 className="size-3.5 text-success" /> : <XCircle className="size-3.5 text-muted" />}
        label="LM Studio"
        value={profile.lmstudioRunning ? t('wizard.lmstudioRunning') : t('wizard.notDetected')}
      />

      {!profile.ollamaRunning && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3 text-[12.5px] text-muted">
          <span>
            {t('wizard.redetectHint')}
          </span>
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={onRefetch}>
            {t('wizard.redetect')}
          </Button>
        </div>
      )}
    </div>
  );
}

function DetectRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[13.5px]">
      <span className="inline-flex size-6 items-center justify-center rounded-md bg-surface-2 text-muted">
        {icon}
      </span>
      <span className="font-medium text-muted">{label}</span>
      <span className="ml-auto text-right text-fg">{value}</span>
    </div>
  );
}

// ─── Step 2 — Pick ───────────────────────────────────────────────────────

function StepPick({
  profile,
  selectedKey,
  onSelect,
}: {
  profile: SystemProfile;
  selectedKey: TierKey;
  onSelect: (key: TierKey) => void;
}) {
  const recommendedKey = useMemo(() => recommendTier(profile), [profile]);
  return (
    <div className="flex flex-col gap-3 pt-1">
      {TIER_CATALOG.map((tier) => {
        const fit = fitForModel(profile, tier);
        const isSelected = tier.key === selectedKey;
        const isRecommended = tier.key === recommendedKey;
        return (
          <TierCard
            key={tier.key}
            tier={tier}
            fit={fit}
            selected={isSelected}
            recommended={isRecommended}
            onClick={() => onSelect(tier.key)}
          />
        );
      })}
    </div>
  );
}

function TierCard({
  tier,
  fit,
  selected,
  recommended,
  onClick,
}: {
  tier: ModelTier;
  fit: FitStatus;
  selected: boolean;
  recommended: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const tone = FIT_TONES[fit];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'group relative w-full rounded-xl border p-4 text-left transition-all',
        selected
          ? 'border-indigo-500 bg-primary-soft/40 ring-1 ring-indigo-500/30'
          : recommended
            ? 'border-indigo-300/70 bg-surface hover:bg-surface-2 dark:border-indigo-400/40'
            : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2',
      )}
    >
      {recommended && (
        // Hero ribbon — ties the recommendation to the detected machine.
        <span className="absolute -top-2 left-4 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10.5px] font-semibold text-white shadow-sm">
          <Sparkles className="size-2.5" /> {t('wizard.recommendedForYou')}
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {selected && <CheckCircle2 className="size-4 shrink-0 text-indigo-600 dark:text-indigo-300" />}
            <span className="font-display text-[15px] font-semibold">{tier.title}</span>
          </div>
          <div className="mt-0.5 font-mono text-[11.5px] text-muted">{tier.model}</div>
          <p className="mt-1.5 text-[12.5px] text-muted">{tier.blurb}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-muted">
              {tier.cloud ? <Cloud className="size-3" /> : <HardDrive className="size-3" />}
              {tier.cloud ? t('model.cloud') : t('model.local')}
            </span>
            {tier.sizeGb != null && !tier.cloud && (
              <span className="inline-flex items-center rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-muted">
                {tier.sizeGb} GB
              </span>
            )}
          </div>
        </div>
        <Badge tone={tone} className="mt-0.5 shrink-0">{FIT_LABELS[fit]}</Badge>
      </div>
    </button>
  );
}

// ─── Step 3 — Confirm ────────────────────────────────────────────────────

function StepConfirm({
  tier,
  profile,
  onRefetchProfile,
  onCloudKeyChange,
}: {
  tier: ModelTier;
  profile: SystemProfile | null;
  onRefetchProfile: () => void;
  /** #672 — called whenever the Anthropic key status is (re-)checked. */
  onCloudKeyChange: (ready: boolean) => void;
}) {
  if (tier.cloud) {
    return <CloudKeyConfirm tier={tier} onKeyStatusChange={onCloudKeyChange} />;
  }

  const isInstalled = profile?.ollamaModels.includes(tier.model) ?? false;
  return (
    <OllamaInstall
      tier={tier}
      isInstalled={isInstalled}
      ollamaRunning={profile?.ollamaRunning ?? false}
      onRefetchProfile={onRefetchProfile}
    />
  );
}

/**
 * Step 3 — cloud path (#672).
 *
 * Checks whether the Anthropic API key is already stored in the OS keyring
 * via `GET /api/v1/secrets`. Fires `onKeyStatusChange` whenever the status
 * is (re-)fetched so the parent can gate the "Usar" button accordingly.
 *
 * The user can open Settings → Modelos in a separate tab, paste the key,
 * then press "Comprobar de nuevo" here — the check re-fetches without
 * blocking the wizard or refreshing the page.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Secrets endpoint shape → `lib/api/secrets.ts` + `api/routers/secrets.py`.
 * Cloud provider name → `liveSecretsApi.CloudProvider` union type.
 */
function CloudKeyConfirm({
  tier,
  onKeyStatusChange,
}: {
  tier: ModelTier;
  onKeyStatusChange: (ready: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);

  const checkKey = useCallback(async () => {
    try {
      const items = await liveSecretsApi.list();
      const anthropic = items.find((item) => item.provider === 'anthropic');
      const ready = anthropic?.configured ?? false;
      setKeyConfigured(ready);
      onKeyStatusChange(ready);
    } catch {
      // If the secrets endpoint is unreachable (e.g. backend down), we
      // stay in the "not configured" state — safe fail, don't unblock.
      setKeyConfigured(false);
      onKeyStatusChange(false);
    }
  }, [onKeyStatusChange]);

  useEffect(() => {
    void checkKey();
  }, [checkKey]);

  return (
    <div className="flex flex-col gap-3 text-[13.5px]">
      <p>
        {t('wizard.cloudChosen')} <strong>{tier.title}</strong>.{' '}
        {/* Static translator copy with one <strong> — rendered via
            <Trans> so the markup is code-owned, not raw HTML. */}
        <Trans i18nKey="wizard.cloudKeyInstructions" components={{ strong: <strong /> }} />
      </p>
      <p className="text-muted">
        {t('wizard.cloudCreateKey')}
      </p>

      {/* Key status indicator — drives the parent's "Usar" button gate. */}
      {keyConfigured === null && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface p-3 text-[12.5px] text-muted">
          <RefreshCw className="size-3.5 animate-spin" />
          <span>{t('wizard.cloudKeyRefresh')}…</span>
        </div>
      )}
      {keyConfigured === true && (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-soft p-3">
          <CheckCircle2 className="size-4 text-success" />
          <span className="text-success font-medium">{t('wizard.cloudKeyReady')}</span>
        </div>
      )}
      {keyConfigured === false && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300/60 bg-amber-soft p-3 text-[12.5px] text-amber-700 dark:text-amber-300">
          <span>{t('wizard.cloudKeyNotSet')}</span>
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={() => void checkKey()}>
            {t('wizard.cloudKeyRefresh')}
          </Button>
        </div>
      )}

      <Button
        size="sm"
        variant="secondary"
        onClick={() => navigate('/settings')}
        className="self-start"
      >
        {t('wizard.openSettings')}
      </Button>
    </div>
  );
}

/**
 * Step 3 — in-app Ollama install (#119).
 *
 * Three local states:
 *   - `idle`: model not yet detected; "Instalar" button kicks the pull.
 *   - `pulling`: streaming progress from `api.models.pull(tier.model)`.
 *     Renders a real bar (completed / total bytes) so the user can see the
 *     download breathe instead of staring at a spinner.
 *   - `done` / `error`: terminal. `done` re-fetches the system profile so
 *     ``ollamaModels`` reflects the new tag. `error` shows the structured
 *     code+message and offers retry.
 *
 * Pre-installed shortcut: if the user already pulled the model (or installed
 * it elsewhere), the `isInstalled` prop is true on mount and we skip the
 * whole pull flow — they only need the "Listo" button at the bottom.
 */
function OllamaInstall({
  tier,
  isInstalled,
  ollamaRunning,
  onRefetchProfile,
}: {
  tier: ModelTier;
  isInstalled: boolean;
  ollamaRunning: boolean;
  onRefetchProfile: () => void;
}) {
  const { t } = useTranslation();
  type PullState =
    | { phase: 'idle' }
    | { phase: 'pulling'; status: string | null; completed: number | null; total: number | null }
    | { phase: 'done' }
    | { phase: 'error'; code: string; message: string };

  const [state, setState] = useState<PullState>(isInstalled ? { phase: 'done' } : { phase: 'idle' });

  const startPull = async () => {
    setState({ phase: 'pulling', status: t('wizard.connecting'), completed: null, total: null });
    try {
      for await (const event of api.models.pull(tier.model)) {
        if (event.type === 'progress') {
          setState({
            phase: 'pulling',
            status: event.status,
            completed: event.completed,
            total: event.total,
          });
        } else if (event.type === 'done') {
          setState({ phase: 'done' });
          onRefetchProfile();
          toast({ tone: 'success', title: t('wizard.installedToast'), message: tier.model });
          return;
        } else {
          setState({ phase: 'error', code: event.code, message: event.message });
          return;
        }
      }
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : t('wizard.pullFailed');
      setState({ phase: 'error', code: 'network', message });
    }
  };

  if (state.phase === 'done') {
    return (
      <div className="flex flex-col gap-3 text-[13.5px]">
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-soft p-3">
          <CheckCircle2 className="size-4 text-success" />
          <span className="text-success font-medium">
            <strong>{tier.model}</strong> {t('wizard.installedReady')}
          </span>
        </div>
      </div>
    );
  }

  if (state.phase === 'pulling') {
    const pct = state.total ? Math.round(((state.completed ?? 0) / state.total) * 100) : null;
    return (
      <div className="flex flex-col gap-3 text-[13.5px]">
        <p>
          {t('wizard.installing')} <strong>{tier.model}</strong>…
        </p>
        <div className="rounded-md border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between text-[12px] text-muted">
            <span>{state.status ?? t('wizard.inProgress')}</span>
            {pct !== null && <span className="font-mono">{pct}%</span>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-indigo-500 transition-[width] duration-200"
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
        </div>
        <p className="text-[12px] text-muted">
          {t('wizard.pullBackgroundHint')}
        </p>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="flex flex-col gap-3 text-[13.5px]">
        <div className="rounded-md border border-danger/30 bg-danger-soft p-3 text-danger">
          <strong>{t('wizard.installFailed')}</strong> {state.message}
        </div>
        <Button size="sm" variant="secondary" onClick={() => void startPull()} className="self-start">
          {t('wizard.retry')}
        </Button>
      </div>
    );
  }

  // idle
  return (
    <div className="flex flex-col gap-3 text-[13.5px]">
      <p>
        {t('wizard.downloadIntroPre')} <strong>{tier.model}</strong> {t('wizard.downloadIntroPost', { size: tier.sizeGb })}
      </p>
      {!ollamaRunning && (
        <div className="rounded-md border border-amber-300/60 bg-amber-soft p-3 text-amber-700 dark:text-amber-300">
          {t('wizard.ollamaNotRunning')}
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <Button
          variant="primary"
          icon={<Download className="size-3.5" />}
          onClick={() => void startPull()}
          disabled={!ollamaRunning}
        >
          {t('wizard.install')}
        </Button>
        <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={onRefetchProfile}>
          {t('wizard.redetect')}
        </Button>
      </div>
    </div>
  );
}

// ─── localStorage helpers ────────────────────────────────────────────────

function readWizardCompleted(): boolean {
  try {
    return localStorage.getItem(WIZARD_COMPLETED_STORAGE_KEY) === 'true';
  } catch {
    return true;
  }
}

function markWizardCompleted(): void {
  try {
    localStorage.setItem(WIZARD_COMPLETED_STORAGE_KEY, 'true');
  } catch {
    /* private mode — ignore. */
  }
}

const WIZARD_SKIPPED_SESSION_KEY = 'lexflow.wizard-skipped-session';

function markWizardSkipped(): void {
  // Session-scoped so the wizard reappears next launch (it's the only
  // discoverability lever for the model setup we have today).
  try {
    sessionStorage.setItem(WIZARD_SKIPPED_SESSION_KEY, 'true');
  } catch {
    /* ignore */
  }
}

function persistPreferredModel(tier: ModelTier): void {
  try {
    localStorage.setItem(PREFERRED_MODEL_STORAGE_KEY, tier.model);
  } catch {
    /* ignore */
  }
}
