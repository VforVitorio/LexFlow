/**
 * `lib/api/secrets.ts` — cloud-provider API key management (#120).
 *
 * Settings → Models is the only consumer. Backend stores the keys in
 * the OS keyring; we only ever see whether a key is set, never its
 * bytes. Wire shape mirrors `src/lexflow/api/routers/secrets.py`.
 *
 * Audit #409 finding #466 — before this client existed the wizard
 * pointed users at Settings → Models but there was no UI to actually
 * paste a key, so cloud providers stayed "Falta clave" forever.
 */

import { http } from './http';

export type CloudProvider = 'openai' | 'anthropic' | 'google';

export interface SecretStatusItem {
  provider: CloudProvider;
  configured: boolean;
}

interface SecretStatusResponse {
  items: SecretStatusItem[];
}

export const liveSecretsApi = {
  /** List which cloud providers have a key configured. */
  list: async (): Promise<SecretStatusItem[]> => {
    const raw = await http<SecretStatusResponse>('/secrets');
    return raw.items;
  },
  /** Store an API key in the OS keyring. The body never round-trips back. */
  set: async (provider: CloudProvider, apiKey: string): Promise<void> => {
    await http<void>('/secrets', {
      method: 'POST',
      body: JSON.stringify({ provider, api_key: apiKey }),
    });
  },
  /** Remove a provider's key. Idempotent — deleting a key that wasn't set still returns 204. */
  remove: async (provider: CloudProvider): Promise<void> => {
    await http<void>(`/secrets/${encodeURIComponent(provider)}`, { method: 'DELETE' });
  },
};
