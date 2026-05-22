import { useState } from 'react';
import { Settings as Cog, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Avatar, Badge, Button, Card, Tabs } from '@/components/ui';
import { useModels, useSyncStatus, useRunSync } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { cn, timeAgo } from '@/lib/utils';

const SECTIONS = ['Perfil', 'Apariencia', 'Modelos', 'Datos', 'Actualizaciones', 'Acerca de'] as const;
type Section = typeof SECTIONS[number];

export function SettingsPage() {
  const [section, setSection] = useState<Section>('Modelos');
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-56 shrink-0 border-r border-border p-4.5">
        <h2 className="mb-3.5 font-display text-lg font-semibold">Ajustes</h2>
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={cn(
              'mb-0.5 block w-full rounded px-2.5 py-1.5 text-left text-[13.5px] transition-colors',
              section === s ? 'bg-primary-soft font-semibold text-indigo-700 dark:text-indigo-200' : 'hover:bg-surface-2',
            )}
          >
            {s}
          </button>
        ))}
      </aside>
      <div className="flex-1 overflow-auto px-10 py-7 scrollbar-thin">
        {section === 'Modelos' && <ModelsSection />}
        {section === 'Apariencia' && <AppearanceSection />}
        {section === 'Datos' && <DataSection />}
        {section !== 'Modelos' && section !== 'Apariencia' && section !== 'Datos' && (
          <div className="py-10 text-center text-muted">
            <h1 className="font-display text-2xl font-semibold">{section}</h1>
            <p className="mt-2 text-sm">Sección por completar — se conectará al endpoint correspondiente.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ModelsSection() {
  const { data: models = [] } = useModels();
  const { defaultModel, setDefaultModel } = useUi();
  const m = models.find((x) => x.id === defaultModel) ?? models[0];

  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">Modelos</h1>
      <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">
        Configura los modelos disponibles para el chat. Los locales se ejecutan en tu máquina; los de nube hacen peticiones salientes.
      </p>

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
