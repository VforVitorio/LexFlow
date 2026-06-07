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

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import {
  CheckCircle2,
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
          // "Saltar" doesn't mark the wizard as completed — it stays
          // available from Settings. We close the modal for this
          // session via a separate storage key.
          markWizardSkipped();
          setOpen(false);
        }}
      />
    </>
  );
}

/**
 * Standalone wizard (no gate). Used by the "Volver a lanzar wizard"
 * button in Settings → Modelos, where the parent owns the open state.
 */
export function ModelWizard({
  onComplete,
  onSkip,
}: {
  onComplete: (tier: TierKey) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const profileQuery = useSystemProfile();
  const [step, setStep] = useState<Step>(1);
  const [selectedKey, setSelectedKey] = useState<TierKey | null>(null);

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
          <StepConfirm tier={selectedTier} profile={profile} onRefetchProfile={profileQuery.refetch} />
        )}

        <WizardFooter
          step={step}
          tier={selectedTier}
          profileReady={!!profile}
          onBack={goBack}
          onNext={goNext}
          onFinish={finish}
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
  onBack,
  onNext,
  onFinish,
}: {
  step: Step;
  tier: ModelTier;
  profileReady: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const isLast = step === 3;
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      {step > 1 ? (
        <Button variant="ghost" onClick={onBack}>
          {t('wizard.back')}
        </Button>
      ) : (
        <span />
      )}
      <Button
        variant="primary"
        onClick={isLast ? onFinish : onNext}
        disabled={step === 1 && !profileReady}
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
    <div className="flex flex-col gap-2.5">
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
      className={cn(
        'text-left rounded-lg border-2 bg-surface p-4 transition-colors hover:bg-surface-2',
        selected ? 'border-indigo-500' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-[15px] font-semibold">{tier.title}</span>
            {recommended && (
              <Badge tone="info" icon={<Sparkles className="size-3" />}>
                {t('wizard.recommended')}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11.5px] text-muted">{tier.model}</div>
          <p className="mt-1.5 text-[12.5px] text-muted">{tier.blurb}</p>
        </div>
        <Badge tone={tone}>{FIT_LABELS[fit]}</Badge>
      </div>
    </button>
  );
}

// ─── Step 3 — Confirm ────────────────────────────────────────────────────

function StepConfirm({
  tier,
  profile,
  onRefetchProfile,
}: {
  tier: ModelTier;
  profile: SystemProfile | null;
  onRefetchProfile: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (tier.cloud) {
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
