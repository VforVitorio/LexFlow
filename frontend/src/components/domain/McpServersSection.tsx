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

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Switch } from '@/components/ui';
import {
  liveMcpServersApi,
  type McpServerCommand,
  type McpServerView,
} from '@/lib/api/mcp-servers';
import { toast } from '@/lib/toast';

export function McpServersSection() {
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await liveMcpServersApi.list();
      setServers(next);
    } catch (exc) {
      toast({
        tone: 'danger',
        title: 'No se pudo cargar MCP',
        message: exc instanceof Error ? exc.message : 'Error desconocido',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const builtinRows = useMemo(() => servers.filter((s) => s.kind === 'builtin'), [servers]);
  const userRows = useMemo(() => servers.filter((s) => s.kind === 'user'), [servers]);

  return (
    <>
      <h1 className="font-display text-[22px] font-semibold">MCP Servers</h1>
      <p className="mt-1 mb-5 max-w-xl text-[13.5px] text-muted">
        Servidores Model Context Protocol que los clientes (Claude Desktop, Cursor, …) pueden lanzar
        para hablar con la legislación. La configuración se guarda en{' '}
        <code className="font-mono">~/.lexflow/mcp.json</code> con el mismo formato que{' '}
        <code className="font-mono">claude_desktop_config.json</code>, así que es portable.
      </p>

      {/* Built-in catalog */}
      <div className="label-caps mb-2">Integrados</div>
      <div className="mb-7 flex flex-col gap-2">
        {builtinRows.map((row) => (
          <ServerRow key={row.name} row={row} onChange={refresh} />
        ))}
      </div>

      {/* User entries */}
      <div className="mb-2 flex items-center justify-between">
        <div className="label-caps">Personalizados</div>
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus className="size-3.5" />}
          onClick={() => setAdding(true)}
        >
          Añadir server
        </Button>
      </div>
      {userRows.length === 0 && !loading && (
        <Card className="p-4 text-[13px] text-muted">
          Aún no has añadido ninguno. Pulsa <strong>Añadir server</strong> para pegar la
          configuración tal cual la tienes en Claude Desktop.
        </Card>
      )}
      <div className="flex flex-col gap-2">
        {userRows.map((row) => (
          <ServerRow key={row.name} row={row} onChange={refresh} />
        ))}
      </div>

      {adding && <AddServerDialog onClose={() => setAdding(false)} onAdded={refresh} />}
    </>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────

function ServerRow({ row, onChange }: { row: McpServerView; onChange: () => Promise<void> }) {
  const summary = renderCommand(row.command);
  const isBuiltin = row.kind === 'builtin';

  const onToggle = async (next: boolean) => {
    if (isBuiltin) return; // UI disables it; defensive.
    try {
      await liveMcpServersApi.toggle(row.name, next);
      await onChange();
    } catch (exc) {
      toast({
        tone: 'danger',
        title: 'No se pudo actualizar',
        message: exc instanceof Error ? exc.message : 'Error desconocido',
      });
    }
  };

  const onDelete = async () => {
    if (isBuiltin) return;
    if (!window.confirm(`Eliminar ${row.name}?`)) return;
    try {
      await liveMcpServersApi.remove(row.name);
      await onChange();
      toast({ tone: 'success', title: 'Eliminado', message: row.name });
    } catch (exc) {
      toast({
        tone: 'danger',
        title: 'No se pudo eliminar',
        message: exc instanceof Error ? exc.message : 'Error desconocido',
      });
    }
  };

  return (
    <Card className="flex items-center gap-3 p-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{row.name}</span>
          <Badge tone={isBuiltin ? 'info' : 'neutral'}>{isBuiltin ? 'Integrado' : 'Personal'}</Badge>
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
          aria-label={`Eliminar ${row.name}`}
          onClick={() => void onDelete()}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </Card>
  );
}

function renderCommand(cmd: McpServerCommand): string {
  if (cmd.url) return `url=${cmd.url}`;
  if (!cmd.command) return '— sin comando —';
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
  const [json, setJson] = useState(EXAMPLE_PASTE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (exc) {
      setError(exc instanceof Error ? `JSON inválido: ${exc.message}` : 'JSON inválido');
      return;
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('mcpServers' in parsed) ||
      typeof (parsed as { mcpServers: unknown }).mcpServers !== 'object'
    ) {
      setError('Falta la clave "mcpServers" o no es un objeto.');
      return;
    }
    const entries = Object.entries(
      (parsed as { mcpServers: Record<string, unknown> }).mcpServers,
    );
    if (entries.length === 0) {
      setError('"mcpServers" está vacío.');
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
          title: `No se pudo añadir ${name}`,
          message: exc instanceof Error ? exc.message : 'Error desconocido',
        });
      }
    }
    setBusy(false);
    if (added > 0) {
      toast({
        tone: 'success',
        title: `${added} server${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'}`,
        message: 'Cargados en mcp.json',
      });
      await onAdded();
      onClose();
    } else if (failed > 0) {
      setError('Ningún server pudo añadirse. Revisa el detalle en los avisos.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Añadir MCP server"
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/35 backdrop-blur-md p-4"
    >
      <div className="air-glass-strong w-full max-w-2xl p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">Añadir MCP server</h2>
            <p className="mt-1 text-[12.5px] text-muted">
              Pega el bloque <code className="font-mono">mcpServers</code> de tu
              <code className="mx-1 font-mono">claude_desktop_config.json</code>. Puedes incluir
              varios servers a la vez.
            </p>
          </div>
          <Button size="icon" variant="ghost" aria-label="Cerrar" onClick={onClose}>
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
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Añadir
          </Button>
        </div>
      </div>
    </div>
  );
}
