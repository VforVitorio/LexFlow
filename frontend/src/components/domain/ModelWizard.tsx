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
import {
  CheckCircle2,
  Copy,
  Cpu,
  HardDrive,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';

import { Badge, Button, Card } from '@/components/ui';
import { Skeleton } from '@/components/domain/Skeleton';
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
    toast({ tone: 'success', title: 'Modelo configurado', message: selectedTier.model });
    onComplete(selectedTier.key);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Configurar modelo de IA"
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
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <div className="label-caps text-muted">Paso {step} de {stepCount}</div>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          {step === 1 && 'Detectando tu equipo'}
          {step === 2 && 'Elige un modelo'}
          {step === 3 && 'Casi listo'}
        </h2>
      </div>
      <button
        type="button"
        onClick={onSkip}
        aria-label="Cerrar el asistente"
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
  const isLast = step === 3;
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      {step > 1 ? (
        <Button variant="ghost" onClick={onBack}>
          Atrás
        </Button>
      ) : (
        <span />
      )}
      <Button
        variant="primary"
        onClick={isLast ? onFinish : onNext}
        disabled={step === 1 && !profileReady}
      >
        {isLast ? `Usar ${tier.title.split(' — ')[0].toLowerCase()}` : 'Continuar'}
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
      <DetectRow icon={<HardDrive className="size-3.5" />} label="RAM" value={`${profile.totalRamGb} GB (${profile.availableRamGb} GB libres)`} />
      <DetectRow icon={<Cpu className="size-3.5" />} label="CPU" value={`${profile.cpuCores} núcleos lógicos`} />
      <DetectRow
        icon={<Sparkles className="size-3.5" />}
        label="GPU"
        value={
          profile.hasNvidiaGpu && profile.vramGb
            ? `${profile.gpuName ?? 'NVIDIA'} (${profile.vramGb} GB VRAM)`
            : profile.isAppleSilicon
              ? `Apple Silicon (memoria unificada)`
              : 'Sin GPU dedicada detectada'
        }
      />
      <DetectRow
        icon={<Cpu className="size-3.5" />}
        label="Plataforma"
        value={profile.platform}
      />
      <DetectRow
        icon={profile.ollamaRunning ? <CheckCircle2 className="size-3.5 text-success" /> : <XCircle className="size-3.5 text-muted" />}
        label="Ollama"
        value={
          profile.ollamaRunning
            ? `corriendo · ${profile.ollamaModels.length} ${profile.ollamaModels.length === 1 ? 'modelo' : 'modelos'} instalado${profile.ollamaModels.length === 1 ? '' : 's'}`
            : 'no detectado'
        }
      />
      <DetectRow
        icon={profile.lmstudioRunning ? <CheckCircle2 className="size-3.5 text-success" /> : <XCircle className="size-3.5 text-muted" />}
        label="LM Studio"
        value={profile.lmstudioRunning ? 'corriendo' : 'no detectado'}
      />

      {!profile.ollamaRunning && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3 text-[12.5px] text-muted">
          <span>
            Si vas a usar un modelo local, inicia Ollama y pulsa Re-detectar.
            En cualquier caso puedes elegir un modelo en nube en el siguiente paso.
          </span>
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={onRefetch}>
            Re-detectar
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
                Recomendado
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
  const navigate = useNavigate();
  if (tier.cloud) {
    return (
      <div className="flex flex-col gap-3 text-[13.5px]">
        <p>
          Has elegido <strong>{tier.title}</strong>. Para usarlo tienes que pegar tu API key de
          Anthropic en <strong>Ajustes → Modelos</strong>. La key se guarda solo en tu equipo;
          LexFlow no la envía a ningún servidor.
        </p>
        <p className="text-muted">
          Si todavía no tienes una, puedes crearla en console.anthropic.com.
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate('/settings')}
          className="self-start"
        >
          Abrir Ajustes
        </Button>
      </div>
    );
  }

  const isInstalled = profile?.ollamaModels.includes(tier.model) ?? false;
  const command = `ollama pull ${tier.model}`;

  return (
    <div className="flex flex-col gap-3 text-[13.5px]">
      <p>
        Para instalar <strong>{tier.model}</strong> en tu equipo, abre una terminal y ejecuta:
      </p>
      <CommandBlock command={command} />
      <div className="flex items-center justify-between rounded-md border border-border bg-surface p-3">
        <div className="flex items-center gap-2">
          {isInstalled ? (
            <CheckCircle2 className="size-4 text-success" />
          ) : (
            <Loader2 className="size-4 text-muted" />
          )}
          <span className={isInstalled ? 'text-success font-medium' : 'text-muted'}>
            {isInstalled ? 'Modelo detectado en Ollama' : 'Esperando a que Ollama lo reporte…'}
          </span>
        </div>
        <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={onRefetchProfile}>
          Comprobar
        </Button>
      </div>
      {!profile?.ollamaRunning && (
        <p className="text-[12px] text-muted">
          Ollama no está corriendo. Inícialo (en macOS/Windows con la app, en Linux con
          <code className="mx-1 rounded bg-surface-2 px-1 font-mono">ollama serve</code>)
          y pulsa Comprobar.
        </p>
      )}
    </div>
  );
}

function CommandBlock({ command }: { command: string }) {
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      toast({ tone: 'success', title: 'Copiado', message: command });
    } catch {
      toast({ tone: 'danger', title: 'No se pudo copiar', message: 'Cópialo a mano.' });
    }
  };
  return (
    <Card className="flex items-center justify-between gap-3 p-3">
      <code className="select-all font-mono text-[12.5px]">{command}</code>
      <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={onCopy}>
        Copiar
      </Button>
    </Card>
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
