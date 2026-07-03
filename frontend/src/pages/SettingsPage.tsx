import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { liveSecretsApi, type SecretStatusItem } from '@/lib/api/secrets';
import { api } from '@/lib/api';
import {
  Settings as Cog,
  CheckCircle2,
  AlertTriangle,
  Wand2,
  Sparkles,
  HelpCircle,
  Download,
  Loader2,
  HardDrive,
  MemoryStick,
  X,
  Trash2,
  Play,
  Power,
} from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Card, Tabs, useConfirm } from '@/components/ui';
import { McpServersSection } from '@/components/domain/McpServersSection';
import { ModelWizard } from '@/components/domain/ModelWizard';
import { useTutorialRelaunch } from '@/components/domain/use-tutorial-relaunch';
import { useHealth, useModels, useInstalledModels, useSemanticStatus, useSyncStatus, useRunSync, useTelemetryStatus, useWhatsNew } from '@/lib/queries';
import type { InstalledModel } from '@/lib/types';
import { Skeleton } from '@/components/domain/Skeleton';
import { useUi } from '@/lib/store';
import { cn, timeAgo } from '@/lib/utils';
import { USER_NAME_STORAGE_KEY } from '@/lib/greeting';
import { toast } from '@/lib/toast';
import { SUPPORTED_LANGS } from '@/i18n';
import type { Lang } from '@/i18n';

// "Personalización" replaces the prior "Perfil" stub (#133) — name +
// language + a11y now have a home. Other sections kept verbatim.
// Each entry pairs a stable id (used to drive switching + content
// dispatch) with the i18n key that renders the visible label.
const SECTIONS = [
  { id: 'personalization', labelKey: 'settings.sections.personalization' },
  { id: 'appearance', labelKey: 'settings.sections.appearance' },
  { id: 'models', labelKey: 'settings.sections.models' },
  { id: 'mcpServers', labelKey: 'settings.sections.mcpServers' },
  { id: 'data', labelKey: 'settings.sections.data' },
  { id: 'diagnostics', labelKey: 'settings.sections.diagnostics' },
  { id: 'privacy', labelKey: 'settings.sections.privacy' },
  { id: 'help', labelKey: 'settings.sections.help' },
  { id: 'updates', labelKey: 'settings.sections.updates' },
  { id: 'about', labelKey: 'settings.sections.about' },
] as const;
type SectionId = typeof SECTIONS[number]['id'];

function isSectionId(value: string | undefined): value is SectionId {
  return !!value && SECTIONS.some((entry) => entry.id === value);
}

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Audit #409: the page used to hardcode 'personalization' and ignore
  // the `:section` URL param, so deep links from the model wizard or
  // docs never landed on the right pane. We seed the state from the
  // param (validated against `SECTIONS`) and push history entries on
  // sidebar clicks so URL ↔ pane stay in sync both directions.
  const { section: sectionParam } = useParams<{ section?: string }>();
  const initialSection: SectionId = isSectionId(sectionParam) ? sectionParam : 'personalization';
  const [section, setSection] = useState<SectionId>(initialSection);
  useEffect(() => {
    if (isSectionId(sectionParam) && sectionParam !== section) setSection(sectionParam);
  }, [sectionParam, section]);
  const selectSection = (id: SectionId) => {
    setSection(id);
    navigate(`/settings/${id}`);
  };
  return (
    // #36 — on mobile (<md) the page stacks: horizontal scroll of
    // section chips on top, content below. On md+ keeps the
    // sidebar + content split that desktop expects.
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* Mobile-only section chips. Scrolls horizontally; selected
          chip wears the indigo treatment so the user knows where
          they are. */}
      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border bg-surface px-4 py-3 scrollbar-thin md:hidden">
        {SECTIONS.map((s) => (
          <button
            key={`mobile-${s.id}`}
            onClick={() => selectSection(s.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors',
              section === s.id
                ? 'border-indigo-500 bg-primary-soft text-indigo-700 dark:text-indigo-200'
                : 'border-border bg-bg text-muted hover:bg-surface-2',
            )}
          >
            {t(s.labelKey)}
          </button>
        ))}
      </div>

      {/* Desktop sidebar — unchanged on md+, hidden on mobile. */}
      <aside className="hidden w-56 shrink-0 border-r border-border p-4.5 md:block">
        <h2 className="mb-3.5 font-display text-lg font-semibold">{t('settings.title')}</h2>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => selectSection(s.id)}
            className={cn(
              'mb-0.5 block w-full rounded px-2.5 py-1.5 text-left text-[13.5px] transition-colors',
              section === s.id ? 'bg-primary-soft font-semibold text-indigo-700 dark:text-indigo-200' : 'hover:bg-surface-2',
            )}
          >
            {t(s.labelKey)}
          </button>
        ))}
      </aside>

      {/* Content. Reduced padding on mobile so 375 px stays usable;
          the desktop px-10 stays for md+. */}
      <div className="flex-1 overflow-auto px-5 py-5 scrollbar-thin md:px-10 md:py-7">
        {section === 'personalization' && <PersonalizacionSection />}
        {section === 'models' && <ModelsSection />}
        {section === 'mcpServers' && <McpServersSection />}
        {section === 'appearance' && <AppearanceSection />}
        {section === 'data' && <DataSection />}
        {section === 'diagnostics' && <DiagnosticsSection />}
        {section === 'privacy' && <PrivacySection />}
        {section === 'help' && <HelpSection />}
        {section === 'updates' && <UpdatesSection />}
        {section === 'about' && <AboutSection />}
      </div>
    </div>
  );
}

/**
 * #115 + #133 — name + language + a11y pointers.
 *
 * The name is owned by `localStorage[USER_NAME_STORAGE_KEY]` (set on
 * the first-run welcome, #229) and read back by the greeting helper
 * (`lib/greeting.ts`). Editing here writes the same key — the next
 * mount of HomePage picks up the change.
 *
 * The language is owned by i18next via `lookupLocalStorage:
 * 'lexflow.lang'` (see `lib/i18n/index.ts`). `i18n.changeLanguage`
 * updates both the runtime + the persisted key.
 *
 * Accessibility deltas (theme, density, reading font size) live in
 * the existing `Apariencia` section — we link to it instead of
 * duplicating the controls here.
 */
function PersonalizacionSection() {
  const { t, i18n } = useTranslation();
  const initialName = readStoredUserName() ?? '';
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();
  const nameDirty = trimmed !== initialName;

  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (trimmed.length === 0) {
        localStorage.removeItem(USER_NAME_STORAGE_KEY);
      } else {
        localStorage.setItem(USER_NAME_STORAGE_KEY, trimmed);
      }
      toast({
        tone: 'info',
        title: trimmed.length === 0
          ? t('settings.personalization.toast.nameClearedTitle')
          : t('settings.personalization.toast.nameSavedTitle'),
        message: trimmed.length === 0
          ? t('settings.personalization.toast.nameClearedBody')
          : t('settings.personalization.toast.nameSavedBody', { name: trimmed }),
      });
    } catch {
      toast({
        tone: 'danger',
        title: t('settings.personalization.toast.nameFailedTitle'),
        message: t('settings.personalization.toast.nameFailedBody'),
      });
    }
  };

  const changeLang = (lang: Lang) => {
    void i18n.changeLanguage(lang);
  };

  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">{t('settings.personalization.title')}</h1>
      <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">{t('settings.personalization.subtitle')}</p>

      {/* Name */}
      <form onSubmit={saveName} className="mb-7">
        <label htmlFor="user-name-input" className="label-caps mb-2 block">{t('settings.personalization.nameLabel')}</label>
        <div className="flex max-w-md items-center gap-2.5">
          <input
            id="user-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('settings.personalization.namePlaceholder')}
            maxLength={48}
            className="flex-1 rounded-md border border-border-strong bg-bg px-3 py-2 text-[14px] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
          />
          <Button type="submit" size="sm" disabled={!nameDirty}>{t('common.save')}</Button>
        </div>
        <p className="mt-1.5 text-[11.5px] text-muted">{t('settings.personalization.nameHint')}</p>
      </form>

      {/* Language */}
      <div className="mb-7">
        <div className="label-caps mb-2">{t('settings.personalization.languageLabel')}</div>
        <Tabs
          variant="segmented"
          value={i18n.resolvedLanguage ?? 'es'}
          onChange={(v) => changeLang(v as Lang)}
          tabs={SUPPORTED_LANGS.map((lng) => ({
            id: lng,
            label: lng === 'es' ? 'Español' : 'English',
          }))}
        />
        <p className="mt-1.5 text-[11.5px] text-muted">{t('settings.personalization.languageHint')}</p>
      </div>

      {/* Accessibility pointer — body has inline <strong>. We render it
          via <Trans> so the only markup is a code-owned <strong> node;
          i18next escaping stays on for everything else. */}
      <div className="rounded-lg border border-border bg-surface/60 p-4">
        <div className="font-display text-[14.5px] font-semibold">{t('settings.personalization.a11yTitle')}</div>
        <p className="mt-1 text-[12.5px] text-muted">
          <Trans i18nKey="settings.personalization.a11yBody" components={{ strong: <strong /> }} />
        </p>
      </div>
    </>
  );
}

function readStoredUserName(): string | null {
  try {
    const raw = localStorage.getItem(USER_NAME_STORAGE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length === 0 ? null : trimmed;
  } catch {
    return null;
  }
}

function ModelsSection() {
  const { t } = useTranslation();
  const { data: models = [] } = useModels();
  const defaultModel = useUi((s) => s.defaultModel);
  const setDefaultModel = useUi((s) => s.setDefaultModel);
  const [wizardOpen, setWizardOpen] = useState(false);
  const m = models.find((x) => x.id === defaultModel) ?? models[0];

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-semibold">{t('settings.models.title')}</h1>
          <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">
            {t('settings.models.subtitle')}
          </p>
        </div>
        <Button size="sm" variant="secondary" icon={<Wand2 className="size-3.5" />} onClick={() => setWizardOpen(true)}>
          {t('settings.models.relaunchWizard')}
        </Button>
      </div>

      {wizardOpen && (
        <ModelWizard
          onComplete={() => setWizardOpen(false)}
          onSkip={() => setWizardOpen(false)}
          onLater={() => setWizardOpen(false)}
        />
      )}

      <div className="label-caps mb-2">{t('settings.models.defaultModel')}</div>
      {m && (
        <Card className="mb-5 flex items-center gap-3 p-3.5">
          <Avatar initials={m.label[0]} />
          <div className="flex-1">
            <div className="font-semibold">{m.label}</div>
            <div className="text-[12px] text-muted">{m.vendor} · {m.available ? t('settings.models.configured') : t('settings.models.missingCredential')}</div>
          </div>
          <Badge tone={m.kind === 'local' ? 'success' : 'info'}>{m.kind === 'local' ? t('model.local') : t('model.cloud')}</Badge>
        </Card>
      )}

      <div className="label-caps mb-2">{t('settings.models.providers')}</div>
      {models.map((p) => (
        <div key={p.id} className="mb-2 flex items-center gap-3.5 rounded-lg border border-border bg-surface p-3.5">
          <div className={cn(
            'inline-flex size-9 items-center justify-center rounded-md font-semibold font-display',
            p.kind === 'local' ? 'bg-success-soft text-success' : 'bg-primary-soft text-indigo-700 dark:text-indigo-200',
          )}>{p.vendor[0]}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold">{p.vendor}</span>
              <span className="font-mono text-[11px] text-muted">{p.id}</span>
            </div>
            {/* #593 — local providers (Ollama/LM Studio) run on the user's
                machine and need NO API key, so "Falta clave" was wrong for
                them. When a local provider isn't available it's just not
                running/detected; only cloud providers can lack a key. */}
            <div className="text-[12px] text-muted">
              {p.available
                ? t('settings.models.connected')
                : p.kind === 'local'
                  ? t('settings.models.notDetected')
                  : t('settings.models.noKey')}
            </div>
          </div>
          <Badge
            tone={p.available ? 'success' : p.kind === 'local' ? 'amber' : 'danger'}
            icon={p.available ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
          >
            {p.available
              ? t('settings.models.active')
              : p.kind === 'local'
                ? t('settings.models.notRunning')
                : t('settings.models.missingKey')}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => setDefaultModel(p.id)} icon={<Cog className="size-3.5" />} />
        </div>
      ))}

      <InstalledModelsCard />
      <ApiKeysCard />
      <SemanticSearchCard />
    </>
  );
}

/** Human-readable on-disk size; Ollama reports bytes. */
function formatModelSize(bytes: number | null): string {
  if (bytes == null) return '—';
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1_000_000;
  return `${Math.round(mb)} MB`;
}

/**
 * #597 — installed Ollama models with per-model actions (load / eject /
 * delete), so a lawyer manages local models without a terminal. Install of
 * new models stays in the wizard ("Volver a lanzar wizard" above), which
 * already streams `ollama pull`.
 */
function InstalledModelsCard() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { data: installed = [], isLoading, refetch } = useInstalledModels();
  const [busy, setBusy] = useState<string | null>(null);

  const toggleLoad = async (model: InstalledModel) => {
    setBusy(model.name);
    try {
      await api.models.load(model.name, !model.loaded);
      toast({
        tone: 'success',
        title: model.loaded ? t('settings.models.installedEjected') : t('settings.models.installedLoaded'),
        message: model.name,
      });
      await refetch();
    } catch (exc) {
      toast({
        tone: 'danger',
        title: t('settings.models.installedActionError'),
        message: exc instanceof Error ? exc.message : String(exc),
      });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (name: string) => {
    const ok = await confirm({
      title: t('common.delete'),
      message: t('settings.models.installedDeleteConfirm', { name }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(name);
    try {
      await api.models.remove(name);
      toast({ tone: 'success', title: t('settings.models.installedDeleted'), message: name });
      await refetch();
    } catch (exc) {
      toast({
        tone: 'danger',
        title: t('settings.models.installedActionError'),
        message: exc instanceof Error ? exc.message : String(exc),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="label-caps mb-2 mt-6">{t('settings.models.installedTitle')}</div>
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : installed.length === 0 ? (
        <Card className="p-4">
          <p className="text-[12.5px] text-muted">{t('settings.models.installedEmpty')}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {installed.map((model) => (
            <InstalledModelRow
              key={model.name}
              model={model}
              busy={busy === model.name}
              onToggleLoad={() => toggleLoad(model)}
              onDelete={() => remove(model.name)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function InstalledModelRow({
  model,
  busy,
  onToggleLoad,
  onDelete,
}: {
  model: InstalledModel;
  busy: boolean;
  onToggleLoad: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3.5 rounded-lg border border-border bg-surface p-3.5">
      <div className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-success-soft text-success">
        <HardDrive className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[13px] font-medium">{model.name}</span>
          {model.loaded && (
            <Badge tone="success" icon={<Power className="size-3" />}>
              {t('settings.models.installedInMemory')}
            </Badge>
          )}
        </div>
        <div className="text-[12px] text-muted">{formatModelSize(model.sizeBytes)}</div>
      </div>
      {busy ? (
        <Loader2 className="size-4 animate-spin text-muted" />
      ) : (
        <>
          <Button
            size="sm"
            variant="secondary"
            icon={model.loaded ? <Power className="size-3.5" /> : <Play className="size-3.5" />}
            onClick={onToggleLoad}
          >
            {model.loaded ? t('settings.models.installedEject') : t('settings.models.installedLoad')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('settings.models.installedDelete')}
            icon={<Trash2 className="size-3.5" />}
            onClick={onDelete}
          />
        </>
      )}
    </div>
  );
}

/**
 * #43 / #578 — Settings → Models "semantic search" card.
 *
 * Surfaces whether the optional ``[semantic]`` extra is installed and
 * whether real (model-based) ranking is in effect, reading
 * ``GET /api/v1/system/semantic-status``.
 *
 * When the extra is NOT installed the card shows a lawyer-friendly pair of
 * buttons — "¿Qué es esto?" (a jargon-free explanation) and "Instalar"
 * (an in-app install streamed from ``POST /system/semantic-install``,
 * #578) — instead of the developer ``uv sync`` command it used to print.
 */
function SemanticSearchCard() {
  const { t } = useTranslation();
  const { data, isLoading, refetch } = useSemanticStatus();
  const [explainOpen, setExplainOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  // Ref guard, not the `installing` state: a rapid double-click (the card
  // button + the dialog's "Adelante") fires before React re-renders, so the
  // state alone wouldn't stop a second stream from starting (#626 review).
  const installingRef = useRef(false);

  const runInstall = useCallback(async () => {
    if (installingRef.current) return;
    installingRef.current = true;
    setExplainOpen(false);
    setInstalling(true);
    setLog([]);
    try {
      for await (const event of api.system.installSemantic()) {
        if (event.type === 'progress') {
          setLog((prev) => [...prev, event.status]);
        } else if (event.type === 'done') {
          toast({
            tone: 'success',
            title: t('settings.models.semanticInstallDone'),
            message: t('settings.models.semanticInstallDoneMsg'),
          });
          await refetch();
        } else {
          toast({ tone: 'danger', title: t('settings.models.semanticInstallError'), message: event.message });
        }
      }
    } catch (exc) {
      toast({
        tone: 'danger',
        title: t('settings.models.semanticInstallError'),
        message: exc instanceof Error ? exc.message : String(exc),
      });
    } finally {
      setInstalling(false);
      installingRef.current = false;
    }
  }, [refetch, t]);

  const statusBadge = () => {
    if (!data) return null;
    if (data.active) {
      return (
        <Badge tone="success" icon={<CheckCircle2 className="size-3" />}>
          {t('settings.models.semanticActive')}
        </Badge>
      );
    }
    if (data.installed) return <Badge tone="amber">{t('settings.models.semanticInstalledInactive')}</Badge>;
    return <Badge tone="neutral">{t('settings.models.semanticNotInstalled')}</Badge>;
  };

  // The contextual line under the badge. The not-installed case no longer
  // shows a CLI command — the buttons below carry the action (#578).
  const body = () => {
    if (!data) return null;
    if (data.active) return t('settings.models.semanticActiveBody', { model: data.model });
    if (data.installed) return t('settings.models.semanticEnableHint');
    return null;
  };

  const showInstallUi = !!data && !data.installed;

  return (
    <>
      <div className="label-caps mb-2 mt-6">{t('settings.models.semanticTitle')}</div>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-indigo-700 dark:text-indigo-200">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isLoading ? (
                <span className="text-[12px] text-muted">{t('settings.models.semanticLoading')}</span>
              ) : (
                statusBadge()
              )}
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted">{t('settings.models.semanticSubtitle')}</p>
            {body() && <p className="mt-2 text-[12.5px] text-muted">{body()}</p>}

            {showInstallUi && !installing && (
              <>
                <SemanticCostRow />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={<HelpCircle className="size-3.5" />} onClick={() => setExplainOpen(true)}>
                    {t('settings.models.semanticWhatIsThis')}
                  </Button>
                  <Button size="sm" variant="primary" icon={<Download className="size-3.5" />} onClick={runInstall}>
                    {t('settings.models.semanticInstall')}
                  </Button>
                </div>
              </>
            )}

            {installing && <SemanticInstallLog log={log} />}
          </div>
        </div>
      </Card>

      {explainOpen && (
        <SemanticExplainDialog onCancel={() => setExplainOpen(false)} onConfirm={runInstall} />
      )}
    </>
  );
}

/** Disk + RAM cost chips, so the user knows the price before installing (#578). */
function SemanticCostRow() {
  const { t } = useTranslation();
  return (
    <div className="mt-2.5 flex flex-wrap gap-2 text-[12px] text-muted">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1">
        <HardDrive className="size-3.5" />
        {t('settings.models.semanticDisk')}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1">
        <MemoryStick className="size-3.5" />
        {t('settings.models.semanticRam')}
      </span>
    </div>
  );
}

/** Streaming install log — opaque pip/uv lines rendered as a tail. */
function SemanticInstallLog({ log }: { log: string[] }) {
  const { t } = useTranslation();
  const last = log[log.length - 1] ?? t('settings.models.semanticInstalling');
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-fg">
        <Loader2 className="size-3.5 animate-spin text-indigo-600 dark:text-indigo-300" />
        {t('settings.models.semanticInstalling')}
      </div>
      <p className="mt-1 truncate font-mono text-[11.5px] text-muted">{last}</p>
    </div>
  );
}

/**
 * "¿Qué es esto?" explanation dialog (#578). Jargon-free copy aimed at a
 * lawyer, the disk/RAM cost, and a clear Cancel / Go-ahead pair. Same
 * hand-rolled overlay shell as the model wizard.
 */
function SemanticExplainDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.models.semanticExplainTitle')}
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/35 backdrop-blur-md p-4"
      onClick={onCancel}
    >
      <div
        className="air-glass-strong w-full max-w-md p-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-indigo-700 dark:text-indigo-200">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold">{t('settings.models.semanticExplainTitle')}</h3>
          </div>
          <button
            type="button"
            aria-label={t('settings.models.semanticCancel')}
            onClick={onCancel}
            className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-fg">{t('settings.models.semanticExplainBody')}</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{t('settings.models.semanticExplainWhy')}</p>
        <div className="mt-4"><SemanticCostRow /></div>
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onCancel}>
            {t('settings.models.semanticCancel')}
          </Button>
          <Button size="sm" variant="primary" icon={<Download className="size-3.5" />} onClick={onConfirm}>
            {t('settings.models.semanticGoAhead')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Audit #466 — per-provider API key form. The wizard tells the user
 * to paste their key in Settings → Models, but until now there was no
 * input to paste it into. The card uses the OS keyring via
 * `liveSecretsApi`; the SPA never sees the raw bytes after a save.
 */
function ApiKeysCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SecretStatusItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await liveSecretsApi.list());
    } catch (exc) {
      toast({
        tone: 'danger',
        title: t('settings.models.apiKeysLoadError'),
        message: exc instanceof Error ? exc.message : String(exc),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      <div className="label-caps mb-2 mt-6">{t('settings.models.apiKeysTitle')}</div>
      <Card className="p-4">
        <p className="mb-4 text-[13px] text-muted">{t('settings.models.apiKeysSubtitle')}</p>
        {loading ? (
          <p className="text-[13px] text-muted">{t('settings.models.apiKeysLoading')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {status.map((row) => (
              <ApiKeyRow key={row.provider} row={row} onChange={refresh} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function ApiKeyRow({ row, onChange }: { row: SecretStatusItem; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await liveSecretsApi.set(row.provider, draft.trim());
      setDraft('');
      await onChange();
      toast({ tone: 'success', title: t('settings.models.apiKeySaved', { provider: row.provider }), message: '' });
    } catch (exc) {
      toast({
        tone: 'danger',
        title: t('settings.models.apiKeyFailed', { provider: row.provider }),
        message: exc instanceof Error ? exc.message : String(exc),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('common.delete'),
      message: t('settings.models.apiKeyConfirmDelete', { provider: row.provider }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await liveSecretsApi.remove(row.provider);
      await onChange();
      toast({ tone: 'info', title: t('settings.models.apiKeyRemoved', { provider: row.provider }), message: '' });
    } catch (exc) {
      toast({
        tone: 'danger',
        title: t('settings.models.apiKeyFailed', { provider: row.provider }),
        message: exc instanceof Error ? exc.message : String(exc),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <div className="min-w-[110px]">
        <div className="font-semibold capitalize">{row.provider}</div>
        <div className="text-[12px] text-muted">
          {row.configured ? t('settings.models.apiKeyConfigured') : t('settings.models.apiKeyMissing')}
        </div>
      </div>
      <input
        type="password"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={row.configured ? t('settings.models.apiKeyPlaceholderConfigured') : t('settings.models.apiKeyPlaceholder')}
        className="min-w-[220px] flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-indigo-500"
        disabled={busy}
      />
      <Button size="sm" type="submit" disabled={busy || !draft.trim()}>
        {busy ? t('settings.models.apiKeySaving') : t('settings.models.apiKeySave')}
      </Button>
      {row.configured && (
        <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
          {t('settings.models.apiKeyRemove')}
        </Button>
      )}
    </form>
  );
}

function AppearanceSection() {
  const { t } = useTranslation();
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const density = useUi((s) => s.density);
  const setDensity = useUi((s) => s.setDensity);
  const readingSize = useUi((s) => s.readingSize);
  const setReadingSize = useUi((s) => s.setReadingSize);
  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">{t('settings.appearance.title')}</h1>
      <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">{t('settings.appearance.subtitle')}</p>

      <div className="label-caps mb-2">{t('settings.appearance.themeLabel')}</div>
      <div className="mb-6 flex gap-3">
        {(['light', 'dark'] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => setTheme(opt)}
            className={cn(
              'flex-1 rounded-lg border-2 bg-surface p-3.5 text-left',
              theme === opt ? 'border-indigo-500' : 'border-border',
            )}
          >
            <div className="flex h-16 rounded-md border border-border" style={{ background: opt === 'light' ? '#f6f6fa' : '#101220' }}>
              <div className="w-1/4" style={{ background: opt === 'light' ? '#e9e9f0' : '#1a1c2c' }} />
            </div>
            <div className="mt-2 text-[13px] font-semibold">{opt === 'light' ? t('settings.appearance.themeLight') : t('settings.appearance.themeDark')}</div>
          </button>
        ))}
      </div>

      <div className="label-caps mb-2">{t('settings.appearance.densityLabel')}</div>
      <Tabs variant="segmented" value={density} onChange={(v) => setDensity(v as 'compact' | 'comfortable' | 'cozy')} tabs={[
        { id: 'compact', label: t('settings.appearance.densityCompact') },
        { id: 'comfortable', label: t('settings.appearance.densityComfortable') },
        { id: 'cozy', label: t('settings.appearance.densityCozy') },
      ]} />

      <div className="label-caps mb-2 mt-6">{t('settings.appearance.readingSizeLabel')}</div>
      <div className="flex items-center gap-3">
        <input type="range" min={14} max={22} step={1} value={readingSize} onChange={(e) => setReadingSize(Number(e.target.value))} className="w-64" />
        <span className="font-mono text-[13px]">{readingSize}px</span>
      </div>
    </>
  );
}

/**
 * Audit #473 — Settings → Updates. Surfaces what changed in the
 * corpus since the user last opened the app, using the existing
 * `useWhatsNew` query (also consumed by SplashGate's WhatsNewPanel).
 *
 * The section is read-only — actual sync triggering lives in the
 * Datos tab (sync run/status) so we don't have two buttons that do
 * almost the same thing.
 */
function UpdatesSection() {
  const { t } = useTranslation();
  const { data, isLoading } = useWhatsNew(null);
  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">{t('settings.updates.title')}</h1>
      <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">{t('settings.updates.subtitle')}</p>
      {isLoading ? (
        <Card>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-64" />
        </Card>
      ) : data && (data.added.length > 0 || data.modified.length > 0 || data.removed.length > 0) ? (
        <Card>
          <div className="grid grid-cols-3 gap-4 text-center">
            <SummaryStat label={t('whatsNew.added')} value={data.added.length} tone="success" />
            <SummaryStat label={t('whatsNew.modified')} value={data.modified.length} tone="info" />
            <SummaryStat label={t('settings.updates.removedShort')} value={data.removed.length} tone="danger" />
          </div>
          {data.toCommit && (
            <p className="mt-4 font-mono text-[12px] text-muted">{t('settings.updates.atCommit', { sha: data.toCommit.slice(0, 7) })}</p>
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-[13.5px] text-muted">{t('settings.updates.upToDate')}</p>
        </Card>
      )}
    </>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: 'success' | 'info' | 'danger' }) {
  const color = tone === 'success' ? 'text-success'
    : tone === 'info' ? 'text-indigo-600 dark:text-indigo-300'
    : 'text-danger';
  return (
    <div>
      <div className={cn('font-display text-2xl font-semibold', color)}>{value}</div>
      <div className="mt-0.5 text-[12.5px] text-muted">{label}</div>
    </div>
  );
}

/**
 * Audit #473 — Settings → About. App version, repo link, license,
 * audit footprint. Static + cheap to render; no backend calls.
 */
function AboutSection() {
  const { t } = useTranslation();
  // The Vite build inlines `__APP_VERSION__` from `package.json`'s
  // version field (see `vite-env.d.ts`). Fall back to "—" so a
  // missing define never crashes the page.
  const version = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '—';
  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">{t('settings.about.title')}</h1>
      <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">{t('settings.about.subtitle')}</p>
      <Card>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[13.5px]">
          <dt className="text-muted">{t('settings.about.version')}</dt>
          <dd className="font-mono">{version}</dd>
          <dt className="text-muted">{t('settings.about.license')}</dt>
          <dd>Apache 2.0</dd>
          <dt className="text-muted">{t('settings.about.repo')}</dt>
          <dd>
            <a
              className="text-indigo-600 hover:underline dark:text-indigo-300"
              href="https://github.com/VforVitorio/LexFlow"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/VforVitorio/LexFlow
            </a>
          </dd>
        </dl>
      </Card>
    </>
  );
}

function HelpSection() {
  const { t } = useTranslation();
  const relaunch = useTutorialRelaunch();
  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">{t('settings.help.title')}</h1>
      <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">
        {t('settings.help.subtitle')}
      </p>

      <div className="label-caps mb-2">{t('settings.help.interactiveTutorial')}</div>
      <Card className="mb-5 flex items-center gap-3 p-3.5">
        <div className="flex-1">
          <div className="font-semibold">{t('settings.help.welcomeTour')}</div>
          <div className="text-[12px] text-muted">
            {t('settings.help.welcomeTourSteps')}
          </div>
        </div>
        <Button size="sm" onClick={relaunch}>
          {t('settings.help.replayTutorial')}
        </Button>
      </Card>

      <div className="label-caps mb-2">{t('settings.help.keyShortcuts')}</div>
      <Card className="p-4 text-[13px]">
        <ul className="space-y-1.5">
          <li><strong>Ctrl K</strong> · {t('settings.help.shortcutPalette')}</li>
          <li><strong>g h / g e / g g / g c / g d / g s</strong> · {t('settings.help.shortcutGoTo')}</li>
          <li><strong>Ctrl \</strong> · {t('settings.help.shortcutCollapse')}</li>
          <li><strong>Ctrl .</strong> · {t('settings.help.shortcutTheme')}</li>
        </ul>
      </Card>
    </>
  );
}

/**
 * Settings → Diagnostics (#330 SPA surface).
 *
 * Polls ``GET /api/v1/system/health`` every 30 s and renders the four
 * probes (memory, disk, corpus, chat DB) plus the overall ``ok`` /
 * ``degraded`` status. Each row stays terse — the user wants a
 * glanceable health summary, not a metrics dashboard.
 */
function DiagnosticsSection() {
  const { t } = useTranslation();
  const { data: health, isLoading, error } = useHealth();

  if (isLoading) {
    return (
      <>
        <h1 className="font-display text-[22px] font-semibold">{t('settings.sections.diagnostics')}</h1>
        <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">{t('settings.diagnostics.subtitle')}</p>
        <Card className="p-4 text-[13px] text-muted">{t('common.loading')}</Card>
      </>
    );
  }

  if (error || !health) {
    return (
      <>
        <h1 className="font-display text-[22px] font-semibold">{t('settings.sections.diagnostics')}</h1>
        <Card className="mt-5 flex items-center gap-2 border-danger/40 bg-danger-soft p-4 text-[13.5px] text-danger">
          <AlertTriangle className="size-4" />
          {t('settings.diagnostics.error')}
        </Card>
      </>
    );
  }

  const statusTone: 'success' | 'amber' = health.status === 'ok' ? 'success' : 'amber';
  const memoryTone: 'success' | 'amber' = health.memory.systemUsedPercent >= 92 ? 'amber' : 'success';
  const diskTone: 'success' | 'amber' = health.disk.usedPercent >= 90 ? 'amber' : 'success';

  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">{t('settings.sections.diagnostics')}</h1>
      <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">{t('settings.diagnostics.subtitle')}</p>

      <Card className="mb-3 flex items-center gap-3 p-3.5">
        <Badge tone={statusTone}>{t(`settings.diagnostics.status.${health.status}`)}</Badge>
        <div className="flex-1">
          <div className="font-mono text-[13px]">v{health.version}</div>
          <div className="text-[12px] text-muted">
            {t('settings.diagnostics.uptime', { seconds: Math.round(health.uptimeSeconds) })}
          </div>
        </div>
      </Card>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Card className="p-3.5">
          <div className="label-caps mb-1">{t('settings.diagnostics.memory.label')}</div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[13px]">{health.memory.rssMb.toFixed(1)} MB RSS</span>
            <Badge tone={memoryTone}>{health.memory.systemUsedPercent.toFixed(1)}%</Badge>
          </div>
          <div className="text-[11.5px] text-muted">{t('settings.diagnostics.memory.systemUsed')}</div>
        </Card>

        <Card className="p-3.5">
          <div className="label-caps mb-1">{t('settings.diagnostics.disk.label')}</div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[13px]">
              {health.disk.freeGb.toFixed(1)} / {health.disk.totalGb.toFixed(0)} GB
            </span>
            <Badge tone={diskTone}>{health.disk.usedPercent.toFixed(1)}%</Badge>
          </div>
          <div className="break-all text-[11.5px] text-muted">{health.disk.path}</div>
        </Card>

        <Card className="p-3.5">
          <div className="label-caps mb-1">{t('settings.diagnostics.corpus.label')}</div>
          <div className="flex items-center gap-2">
            {health.corpus.submodulePresent
              ? <CheckCircle2 className="size-4 text-success" />
              : <AlertTriangle className="size-4 text-amber-600" />}
            <span className="font-mono text-[13px]">
              {t('settings.diagnostics.corpus.lawsIndexed', { count: health.corpus.lawsIndexed })}
            </span>
          </div>
        </Card>

        <Card className="p-3.5">
          <div className="label-caps mb-1">{t('settings.diagnostics.chatDb.label')}</div>
          <div className="flex items-center gap-2">
            {health.chatDb.reachable
              ? <CheckCircle2 className="size-4 text-success" />
              : <AlertTriangle className="size-4 text-amber-600" />}
            <span className="text-[13px]">
              {t(`settings.diagnostics.chatDb.${health.chatDb.reachable ? 'reachable' : 'unreachable'}`)}
            </span>
          </div>
        </Card>
      </div>
    </>
  );
}


function DataSection() {
  const { t } = useTranslation();
  const { data: sync } = useSyncStatus();
  const run = useRunSync();
  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">{t('settings.data.title')}</h1>
      <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">
        {t('settings.data.subtitlePre')} <code className="font-mono">legalize-es</code>{t('settings.data.subtitlePost')}
      </p>
      <Card className="mb-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="font-mono text-[13px]">{sync?.upstream ?? 'legalize-es@main'}</div>
            <div className="text-[12px] text-muted">{t('settings.data.lastSync', { ago: timeAgo(sync?.lastSyncAt), behind: sync?.behind ?? 0 })}</div>
          </div>
          <Button size="sm" loading={run.isPending} onClick={() => run.mutate()}>{t('settings.data.syncNow')}</Button>
        </div>
      </Card>
    </>
  );
}

/**
 * Settings → Privacidad (Privacy) — telemetry opt-in toggle (#331 SPA gate).
 *
 * Two-gate model the user can see at a glance:
 *
 *  1. **Backend gate** — read from ``GET /api/v1/telemetry/status``.
 *     When false, the user's toggle is informational only; events
 *     wouldn't reach disk even if fired.
 *  2. **User gate** — Zustand ``telemetryConsent``, persisted to
 *     ``localStorage`` so the choice survives reloads.
 *
 * The toggle stays interactive even when the backend gate is off so
 * the user can pre-commit their preference for whenever the operator
 * enables it. The status pill makes the dependency explicit.
 */
function PrivacySection() {
  const { t } = useTranslation();
  const telemetryConsent = useUi((s) => s.telemetryConsent);
  const setTelemetryConsent = useUi((s) => s.setTelemetryConsent);
  const { data: backendStatus, isLoading } = useTelemetryStatus();
  const backendEnabled = backendStatus?.enabled ?? false;
  const effective = telemetryConsent && backendEnabled;

  const toggle = () => {
    const next = !telemetryConsent;
    setTelemetryConsent(next);
    toast({
      tone: 'info',
      title: next ? t('settings.privacy.toast.optedInTitle') : t('settings.privacy.toast.optedOutTitle'),
      message: next ? t('settings.privacy.toast.optedInBody') : t('settings.privacy.toast.optedOutBody'),
    });
  };

  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">{t('settings.privacy.title')}</h1>
      <p className="mt-1 mb-5 max-w-2xl text-[13.5px] text-muted">{t('settings.privacy.subtitle')}</p>

      <Card className="mb-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="font-display text-[15px] font-semibold">{t('settings.privacy.toggleLabel')}</div>
            <p className="mt-1 text-[12.5px] text-muted">{t('settings.privacy.toggleHint')}</p>
          </div>
          <Button size="sm" variant={telemetryConsent ? 'secondary' : 'primary'} onClick={toggle}>
            {telemetryConsent ? t('settings.privacy.disable') : t('settings.privacy.enable')}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
          <Badge tone={telemetryConsent ? 'success' : 'neutral'}>
            {t('settings.privacy.userGate')}: {telemetryConsent ? t('settings.privacy.on') : t('settings.privacy.off')}
          </Badge>
          <Badge tone={backendEnabled ? 'success' : 'neutral'}>
            {t('settings.privacy.backendGate')}:{' '}
            {isLoading
              ? '…'
              : backendEnabled
                ? t('settings.privacy.on')
                : t('settings.privacy.off')}
          </Badge>
          <Badge tone={effective ? 'success' : 'neutral'}>
            {t('settings.privacy.effective')}: {effective ? t('settings.privacy.on') : t('settings.privacy.off')}
          </Badge>
        </div>
      </Card>

      <Card className="border-border bg-surface/60 p-4">
        <div className="font-display text-[14.5px] font-semibold">{t('settings.privacy.whatWeCollectTitle')}</div>
        <p className="mt-1 text-[12.5px] text-muted">{t('settings.privacy.whatWeCollectBody')}</p>
      </Card>
    </>
  );
}
