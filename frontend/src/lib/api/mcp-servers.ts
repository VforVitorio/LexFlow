/**
 * `lib/api/mcp-servers.ts` — CRUD client for `/api/v1/mcp/servers` (#122).
 *
 * Settings page → MCP Servers section is the only consumer. Kept on
 * the live API (no mock fallback) because the data is per-user state
 * that lives in `<config_dir>/mcp.json` — mock-mode SPA dev simply
 * gets the built-in catalog with an empty user list.
 */

import { http } from './http';

export interface McpServerCommand {
  command: string | null;
  args: string[];
  env: Record<string, string>;
  url: string | null;
}

export type McpServerKind = 'builtin' | 'user';

export interface McpServerView {
  name: string;
  description: string;
  command: McpServerCommand;
  kind: McpServerKind;
  enabled: boolean;
  docs_url: string | null;
}

export interface McpServerListResponse {
  items: McpServerView[];
}

export interface McpServerCreateBody {
  name: string;
  description?: string;
  command: McpServerCommand;
}

export const liveMcpServersApi = {
  list: async (): Promise<McpServerView[]> => {
    const raw = await http<McpServerListResponse>('/mcp/servers');
    return raw.items;
  },
  create: async (body: McpServerCreateBody): Promise<McpServerView> => {
    return await http<McpServerView>('/mcp/servers', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  toggle: async (name: string, enabled: boolean): Promise<McpServerView> => {
    return await http<McpServerView>(`/mcp/servers/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },
  remove: async (name: string): Promise<void> => {
    await http<void>(`/mcp/servers/${encodeURIComponent(name)}`, { method: 'DELETE' });
  },
};
