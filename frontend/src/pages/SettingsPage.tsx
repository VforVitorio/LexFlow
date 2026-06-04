import { useState } from 'react';
import { Settings as Cog, CheckCircle2, AlertTriangle, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Card, Tabs } from '@/components/ui';
import { McpServersSection } from '@/components/domain/McpServersSection';
import { ModelWizard } from '@/components/domain/ModelWizard';
import { useTutorialRelaunch } from '@/components/domain/use-tutorial-relaunch';
import { useModels, useSyncStatus, useRunSync } from '@/lib/queries';
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
  { id: 'help', labelKey: 'settings.sections.help' },
  { id: 'updates', labelKey: 'settings.sections.updates' },
  { id: 'about', labelKey: 'settings.sections.about' },
] as const;
type SectionId = typeof SECTIONS[number]['id'];

export function SettingsPage() {
  const { t } = useTranslation();
  const [section, setSection] = useState<SectionId>('personalization');
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
            onClick={() => setSection(s.id)}
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
            onClick={() => setSection(s.id)}
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
        {section === 'help' && <HelpSection />}
        {(section === 'updates' || section === 'about') && (
          <div className="py-10 text-center text-muted">
            <h1 className="font-display text-2xl font-semibold">{t(`settings.sections.${section}`)}</h1>
            <p className="mt-2 text-sm">{t('settings.underConstruction')}</p>
          </div>
        )}
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

      {/* Accessibility pointer — body has inline <strong> so we render
          the translated HTML safely; the only markup is a known tag. */}
      <div className="rounded-lg border border-border bg-surface/60 p-4">
        <div className="font-display text-[14.5px] font-semibold">{t('settings.personalization.a11yTitle')}</div>
        <p
          className="mt-1 text-[12.5px] text-muted"
          // Body contains a single <strong>…</strong> — no user input
          // ever flows through here, so the dangerouslySetInnerHTML is
          // bounded to a static, code-owned dictionary value.
          dangerouslySetInnerHTML={{ __html: t('settings.personalization.a11yBody') }}
        />
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
  const { data: models = [] } = useModels();
  const { defaultModel, setDefaultModel } = useUi();
  const [wizardOpen, setWizardOpen] = useState(false);
  const m = models.find((x) => x.id === defaultModel) ?? models[0];

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-semibold">Modelos</h1>
          <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">
            Configura los modelos disponibles para el chat. Los locales se ejecutan en tu máquina; los de nube hacen peticiones salientes.
          </p>
        </div>
        <Button size="sm" variant="secondary" icon={<Wand2 className="size-3.5" />} onClick={() => setWizardOpen(true)}>
          Volver a lanzar wizard
        </Button>
      </div>

      {wizardOpen && (
        <ModelWizard
          onComplete={() => setWizardOpen(false)}
          onSkip={() => setWizardOpen(false)}
        />
      )}

      <div className="label-caps mb-2">Modelo por defecto</div>
      {m && (
        <Card className="mb-5 flex items-center gap-3 p-3.5">
          <Avatar initials={m.label[0]} />
          <div className="flex-1">
            <div className="font-semibold">{m.label}</div>
            <div className="text-[12px] text-muted">{m.vendor} · {m.available ? 'configurado' : 'falta credencial'}</div>
          </div>
          <Badge tone={m.kind === 'local' ? 'success' : 'info'}>{m.kind === 'local' ? 'local' : 'nube'}</Badge>
        </Card>
      )}

      <div className="label-caps mb-2">Proveedores</div>
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
            <div className="text-[12px] text-muted">{p.available ? 'Conectado' : 'Sin clave configurada'}</div>
          </div>
          <Badge tone={p.available ? 'success' : 'danger'} icon={p.available ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}>
            {p.available ? 'Activo' : 'Falta clave'}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => setDefaultModel(p.id)} icon={<Cog className="size-3.5" />} />
        </div>
      ))}
    </>
  );
}

function AppearanceSection() {
  const { theme, setTheme, density, setDensity, readingSize, setReadingSize } = useUi();
  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">Apariencia</h1>
      <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">Tema, densidad y tipografía.</p>

      <div className="label-caps mb-2">Tema</div>
      <div className="mb-6 flex gap-3">
        {(['light', 'dark'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            className={cn(
              'flex-1 rounded-lg border-2 bg-surface p-3.5 text-left',
              theme === t ? 'border-indigo-500' : 'border-border',
            )}
          >
            <div className="flex h-16 rounded-md border border-border" style={{ background: t === 'light' ? '#f6f6fa' : '#101220' }}>
              <div className="w-1/4" style={{ background: t === 'light' ? '#e9e9f0' : '#1a1c2c' }} />
            </div>
            <div className="mt-2 text-[13px] font-semibold">{t === 'light' ? 'Claro' : 'Oscuro'}</div>
          </button>
        ))}
      </div>

      <div className="label-caps mb-2">Densidad</div>
      <Tabs variant="segmented" value={density} onChange={(v) => setDensity(v as 'compact' | 'comfortable' | 'cozy')} tabs={[
        { id: 'compact', label: 'Compacto' },
        { id: 'comfortable', label: 'Cómodo' },
        { id: 'cozy', label: 'Amplio' },
      ]} />

      <div className="label-caps mb-2 mt-6">Tamaño de lectura (página de norma)</div>
      <div className="flex items-center gap-3">
        <input type="range" min={14} max={22} step={1} value={readingSize} onChange={(e) => setReadingSize(Number(e.target.value))} className="w-64" />
        <span className="font-mono text-[13px]">{readingSize}px</span>
      </div>
    </>
  );
}

function HelpSection() {
  const relaunch = useTutorialRelaunch();
  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">Ayuda</h1>
      <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">
        Recursos de iniciación. El tutorial sombreado te lleva por las cinco secciones del
        producto en menos de un minuto.
      </p>

      <div className="label-caps mb-2">Tutorial interactivo</div>
      <Card className="mb-5 flex items-center gap-3 p-3.5">
        <div className="flex-1">
          <div className="font-semibold">Tour de bienvenida</div>
          <div className="text-[12px] text-muted">
            6 pasos: layout, atajos, paleta de comandos, búsqueda, grafo y chat.
          </div>
        </div>
        <Button size="sm" onClick={relaunch}>
          Repetir tutorial
        </Button>
      </Card>

      <div className="label-caps mb-2">Atajos clave</div>
      <Card className="p-4 text-[13px]">
        <ul className="space-y-1.5">
          <li><strong>Ctrl K</strong> · paleta universal de búsqueda y navegación</li>
          <li><strong>g h / g e / g g / g c / g d / g s</strong> · saltar a Inicio / Explorador / Grafo / Chat / Cuadros / Ajustes</li>
          <li><strong>Ctrl \</strong> · plegar el panel izquierdo</li>
          <li><strong>Ctrl .</strong> · cambiar tema claro / oscuro</li>
        </ul>
      </Card>
    </>
  );
}

function DataSection() {
  const { data: sync } = useSyncStatus();
  const run = useRunSync();
  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">Datos</h1>
      <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">
        El corpus se sincroniza desde el repositorio <code className="font-mono">legalize-es</code>. Conserva los archivos Markdown originales.
      </p>
      <Card className="mb-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="font-mono text-[13px]">{sync?.upstream ?? 'legalize-es@main'}</div>
            <div className="text-[12px] text-muted">Última sincronización {timeAgo(sync?.lastSyncAt)} · {sync?.behind ?? 0} commits pendientes</div>
          </div>
          <Button size="sm" loading={run.isPending} onClick={() => run.mutate()}>Sincronizar ahora</Button>
        </div>
      </Card>
    </>
  );
}
