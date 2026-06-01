/**
 * `liveApi.models` — flat list of `(provider, model)` pairs (#82).
 *
 * Unconfigured providers surface as placeholder rows with
 * `available=false` instead of being hidden, so the Settings page
 * can render them with a "needs setup" hint and the user knows the
 * full set of options upfront.
 */

import type { BackendModelInfo } from '../../api';
import type { ApiClient, Model } from '../types';
import { http } from './http';

export const liveModelsApi: ApiClient['models'] = {
  list: async () => {
    const raw = await http<BackendModelInfo[]>('/models');
    return raw.map<Model>((m) => ({
      id: m.id,
      // Placeholder rows have no model name — fall back to the provider key
      // so the Settings list still renders something legible.
      label: m.model || m.provider,
      vendor: m.provider,
      kind: m.local ? 'local' : 'cloud',
      available: m.configured,
    }));
  },
};
