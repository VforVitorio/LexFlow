/**
 * Settings → MCP Servers section (#122).
 *
 * Two lists: the read-only built-in catalog the LexFlow app ships with,
 * and the user-added entries persisted to `<config_dir>/mcp.json`.
 * Adding a server uses one input style today — paste of the Claude
 * Desktop `claude_desktop_config.json` JSON snippet — because the
 * other two methods from the issue (registry slug + .mcpb bundle) need
 * a follow-up sub-task once the registry MCP API + a packaging story
 * are clearer.
 *
 * Wire format documented in the API client (`lib/api/mcp-servers.ts`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Card, Switch, Tabs, useConfirm } from '@/components/ui';
import {
  liveMcpServersApi,
  type McpServerCommand,
  type McpServerView,
  type McpToolView,
} from '@/lib/api/mcp-servers';
import { toast } from '@/lib/toast';

type McpTab = 'servers' | 'tools' | 'bundle';

export function McpServersSection() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  // Audit #478 — sub-tabs for the three MCP surfaces. Lives in
  // component state (no URL param) because the MCP section is itself
  // already URL-addressable via Settings → mcpServers; adding a
  // second level would be noise.
  const [tab, setTab] = useState<McpTab>('servers');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await liveMcpServersApi.list();
      setServers(next);
    } catch (exc) {
      toast({
        tone: 'danger',
        title: t('mcp.loadError'),
        message: exc instanceof Error ? exc.message : t('mcp.unknownError'),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const builtinRows = useMemo(() => servers.filter((s) => s.kind === 'builtin'), [servers]);
  const userRows = useMemo(() => servers.filter((s) => s.kind === 'user'), [servers]);

  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">{t('mcp.title')}</h1>
      <p className="mt-1 mb-3 max-w-xl text-[13.5px] text-muted">
        {t('mcp.introPre')}{' '}
        <code className="font-mono">~/.lexflow/mcp.json</code> {t('mcp.introMid')}{' '}
        <code className="font-mono">claude_desktop_config.json</code>, {t('mcp.introEnd')}
      </p>
      <Tabs
        variant="segmented"
        value={tab}
        onChange={(v) => setTab(v as McpTab)}
        tabs={[
          { id: 'servers', label: t('mcp.tabServers') },
          { id: 'tools', label: t('mcp.tabTools') },
          { id: 'bundle', label: t('mcp.tabBundle') },
        ]}
      />

      {tab === 'servers' && (
        <div className="mt-5">
          {/* Built-in catalog */}
          <div className="label-caps mb-2">{t('mcp.builtin')}</div>
          <div className="mb-7 flex flex-col gap-2">
            {builtinRows.map((row) => (
              <ServerRow key={row.name} row={row} onChange={refresh} />
            ))}
          </div>

          {/* User entries */}
          <div className="mb-2 flex items-center justify-between">
            <div className="label-caps">{t('mcp.custom')}</div>
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus className="size-3.5" />}
              onClick={() => setAdding(true)}
            >
              {t('mcp.addServer')}
            </Button>
          </div>
          {userRows.length === 0 && !loading && (
            <Card className="p-4 text-[13px] text-muted">
              {t('mcp.emptyPre')} <strong>{t('mcp.addServer')}</strong> {t('mcp.emptyPost')}
            </Card>
          )}
          <div className="flex flex-col gap-2">
            {userRows.map((row) => (
              <ServerRow key={row.name} row={row} onChange={refresh} />
            ))}
          </div>
        </div>
      )}

      {tab === 'tools' && <ToolsCatalogue />}
      {tab === 'bundle' && <BundleInstaller onInstalled={refresh} />}

      {adding && <AddServerDialog onClose={() => setAdding(false)} onAdded={refresh} />}
    </>
  );
}

/**
 * Audit #478 — surfaces every tool exposed by attached external MCP
 * servers (`GET /mcp/tools`). Built-in LexFlow tools (`search_law`
 * etc.) are NOT included — they live in-process and the agentic loop
 * dispatches them directly. This is the discovery surface for users
 * who want to know what a third-party server actually adds.
 */
function ToolsCatalogue() {
  const { t } = useTranslation();
  const [tools, setTools] = useState<McpToolView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    liveMcpServersApi
      .listTools()
      .then((next) => { if (!cancelled) setTools(next); })
      .catch((exc) => {
        if (cancelled) return;
        setError(exc instanceof Error ? exc.message : t('mcp.unknownError'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);

  const grouped = useMemo(() => {
    const m = new Map<string, McpToolView[]>();
    for (const tool of tools) {
      const arr = m.get(tool.server_name) ?? [];
      arr.push(tool);
      m.set(tool.server_name, arr);
    }
    return [...m.entries()];
  }, [tools]);

  if (loading) {
    return <p className="mt-5 text-[13px] text-muted">{t('mcp.toolsLoading')}</p>;
  }
  if (error) {
    return <p className="mt-5 text-[13px] text-danger">{error}</p>;
  }
  if (grouped.length === 0) {
    return (
      <Card className="mt-5 p-4 text-[13px] text-muted">{t('mcp.toolsEmpty')}</Card>
    );
  }
  return (
    <div className="mt-5 flex flex-col gap-4">
      {grouped.map(([server, items]) => (
        <div key={server}>
          <div className="label-caps mb-2">{server}</div>
          <div className="flex flex-col gap-1.5">
            {items.map((tool) => (
              <Card key={tool.qualified_name} className="p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[13px] font-semibold">{tool.name}</span>
                  <span className="font-mono text-[11px] text-muted">{tool.qualified_name}</span>
                </div>
                {tool.description && (
                  <p className="mt-1 text-[12.5px] text-muted">{tool.description}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Audit #478 — `.mcpb` bundle uploader (Anthropic Desktop Extensions).
 * Drag a `.mcpb` archive (zip) onto the drop zone; the backend
 * validates the manifest, extracts the bundle to
 * `<config_dir>/mcp-bundles/<name>/`, persists the entry, and we
 * refresh the servers list so the new entry shows up immediately.
 */
function BundleInstaller({ onInstalled }: { onInstalled: () => Promise<void> }) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const install = async (file: File) => {
    if (!file.name.endsWith('.mcpb')) {
      toast({ tone: 'warning', title: t('mcp.bundleWrongExt'), message: file.name });
      return;
    }
    setBusy(true);
    try {
      const entry = await liveMcpServersApi.installBundle(file);
      await onInstalled();
      toast({ tone: 'success', title: t('mcp.bundleInstalled'), message: entry.name });
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : t('mcp.unknownError');
      toast({ tone: 'danger', title: t('mcp.bundleFailed'), message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card className="mt-5 p-6 text-center">
      <Upload className="mx-auto size-9 text-muted" />
      <h3 className="mt-2 font-display text-base font-semibold">{t('mcp.bundleTitle')}</h3>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">{t('mcp.bundleSubtitle')}</p>
      <input
        ref={fileRef}
        type="file"
        accept=".mcpb,application/zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void install(file);
        }}
      />
      <Button
        className="mt-4"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        icon={<Upload className="size-3.5" />}
      >
        {busy ? t('mcp.bundleInstalling') : t('mcp.bundleChooseFile')}
      </Button>
    </Card>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────

function ServerRow({ row, onChange }: { row: McpServerView; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const summary = renderCommand(row.command, t('mcp.noCommand'));
  const isBuiltin = row.kind === 'builtin';

  const onToggle = async (next: boolean) => {
    if (isBuiltin) return; // UI disables it; defensive.
    try {
      await liveMcpServersApi.toggle(row.name, next);
      await onChange();
    } catch (exc) {
      toast({
        tone: 'danger',
        title: t('mcp.updateError'),
        message: exc instanceof Error ? exc.message : t('mcp.unknownError'),
      });
    }
  };

  const onDelete = async () => {
    if (isBuiltin) return;
    const ok = await confirm({
      title: t('common.delete'),
      message: t('mcp.confirmDelete', { name: row.name }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await liveMcpServersApi.remove(row.name);
      await onChange();
      toast({ tone: 'success', title: t('mcp.deleted'), message: row.name });
    } catch (exc) {
      toast({
        tone: 'danger',
        title: t('mcp.deleteError'),
        message: exc instanceof Error ? exc.message : t('mcp.unknownError'),
      });
    }
  };

  return (
    <Card className="flex items-center gap-3 p-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{row.name}</span>
          <Badge tone={isBuiltin ? 'info' : 'neutral'}>{isBuiltin ? t('mcp.badgeBuiltin') : t('mcp.badgePersonal')}</Badge>
        </div>
        {row.description && (
          <div className="mt-0.5 text-[12px] text-muted">{row.description}</div>
        )}
        <div className="mt-1 truncate font-mono text-[11.5px] text-muted">{summary}</div>
      </div>
      <Switch checked={row.enabled} onChange={onToggle} disabled={isBuiltin} />
      {!isBuiltin && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('mcp.deleteAria', { name: row.name })}
          onClick={() => void onDelete()}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </Card>
  );
}

function renderCommand(cmd: McpServerCommand, noCommandLabel: string): string {
  if (cmd.url) return `url=${cmd.url}`;
  if (!cmd.command) return noCommandLabel;
  const args = cmd.args.length ? ` ${cmd.args.join(' ')}` : '';
  return `${cmd.command}${args}`;
}

// ─── Add dialog ──────────────────────────────────────────────────────────

const EXAMPLE_PASTE = `{
  "mcpServers": {
    "context-mode": {
      "command": "npx",
      "args": ["mksglu/context-mode"]
    }
  }
}`;

/**
 * Modal that accepts a JSON paste shaped like Claude Desktop's
 * `claude_desktop_config.json`. Splits multi-server pastes into
 * individual POSTs — useful when the user copies their whole config in
 * one go.
 */
function AddServerDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [json, setJson] = useState(EXAMPLE_PASTE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (exc) {
      setError(exc instanceof Error ? t('mcp.invalidJsonDetail', { detail: exc.message }) : t('mcp.invalidJson'));
      return;
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('mcpServers' in parsed) ||
      typeof (parsed as { mcpServers: unknown }).mcpServers !== 'object'
    ) {
      setError(t('mcp.missingKey'));
      return;
    }
    const entries = Object.entries(
      (parsed as { mcpServers: Record<string, unknown> }).mcpServers,
    );
    if (entries.length === 0) {
      setError(t('mcp.emptyKey'));
      return;
    }

    setBusy(true);
    let added = 0;
    let failed = 0;
    for (const [name, body] of entries) {
      if (!body || typeof body !== 'object') continue;
      const cfg = body as Record<string, unknown>;
      try {
        await liveMcpServersApi.create({
          name,
          description: typeof cfg.description === 'string' ? cfg.description : '',
          command: {
            command: typeof cfg.command === 'string' ? cfg.command : null,
            args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
            env:
              cfg.env && typeof cfg.env === 'object' && !Array.isArray(cfg.env)
                ? Object.fromEntries(
                    Object.entries(cfg.env as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
                  )
                : {},
            url: typeof cfg.url === 'string' ? cfg.url : null,
          },
        });
        added++;
      } catch (exc) {
        failed++;
        toast({
          tone: 'warning',
          title: t('mcp.addFailed', { name }),
          message: exc instanceof Error ? exc.message : t('mcp.unknownError'),
        });
      }
    }
    setBusy(false);
    if (added > 0) {
      toast({
        tone: 'success',
        title: t('mcp.addedToast', { count: added }),
        message: t('mcp.addedToastBody'),
      });
      await onAdded();
      onClose();
    } else if (failed > 0) {
      setError(t('mcp.noneAdded'));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('mcp.dialogTitle')}
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/35 backdrop-blur-md p-4"
    >
      <div className="air-glass-strong w-full max-w-2xl p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">{t('mcp.dialogTitle')}</h2>
            <p className="mt-1 text-[12.5px] text-muted">
              {t('mcp.dialogIntroPre')} <code className="font-mono">mcpServers</code> {t('mcp.dialogIntroMid')}
              <code className="mx-1 font-mono">claude_desktop_config.json</code>. {t('mcp.dialogIntroEnd')}
            </p>
          </div>
          <Button size="icon" variant="ghost" aria-label={t('mcp.close')} onClick={onClose}>
            ×
          </Button>
        </div>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={12}
          spellCheck={false}
          className="w-full rounded-md border border-border-strong bg-bg p-3 font-mono text-[12.5px] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
        />
        {error && (
          <div className="mt-2 rounded-md border border-danger/30 bg-danger-soft p-2.5 text-[12.5px] text-danger">
            {error}
          </div>
        )}
        <div className="mt-4 flex items-center justify-end gap-2.5">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            {t('mcp.add')}
          </Button>
        </div>
      </div>
    </div>
  );
}
