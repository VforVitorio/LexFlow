/**
 * `liveApi.dashboards` — Plotly-as-JSON metrics per preset (#85).
 *
 * The wire is snake_case; we flip `recent_from` → `recentFrom` here
 * so the React side sticks to camelCase end-to-end.
 */

import type { BackendDashboard } from '../../api';
import type { ApiClient } from '../types';
import { http } from './http';

export const liveDashboardsApi: ApiClient['dashboards'] = {
  metrics: async (preset) => {
    const raw = await http<BackendDashboard>(`/dashboards/${encodeURIComponent(preset)}`);
    return {
      preset: raw.preset as 'compliance' | 'analytics',
      cards: raw.cards.map((c) => ({
        id: c.id,
        title: c.title,
        value: c.value,
        delta: c.delta,
        spark: c.spark ?? [],
        positive: c.positive ?? undefined,
      })),
      series: {
        labels: raw.series.labels,
        values: raw.series.values,
        recentFrom: raw.series.recent_from ?? undefined,
      },
    };
  },
};
