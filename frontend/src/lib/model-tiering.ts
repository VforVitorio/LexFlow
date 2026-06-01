/**
 * Model-tiering logic for the wizard (#118).
 *
 * Pure functions only — no React, no fetch, no side effects. The wizard
 * consumes these in two places:
 *   1. To **pre-select** a tier card based on the host's hardware
 *      (`recommendTier`).
 *   2. To **annotate every card** with a fit verdict ("Va sobrado",
 *      "Justo justo", …) so the user sees at a glance what their
 *      machine can take (`fitForModel` + `FIT_LABELS`).
 *
 * Audience note: the wizard targets jurists, not ML engineers. We
 * deliberately do NOT surface tokens-per-second, GFLOPS or any other
 * benchmark output — those numbers are noise to the target user. The
 * 5-status vocabulary below is the entire UX surface.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * New tier added (e.g. qwen3:14b)   → TIER_CATALOG.
 * Threshold tweaks                  → FIT_THRESHOLDS.
 * Localised labels                  → FIT_LABELS.
 */

import type { SystemProfile } from './types';

// ─── Catalog ─────────────────────────────────────────────────────────────

export type TierKey = 'small' | 'balanced' | 'large' | 'cloud';

export interface ModelTier {
  /** Stable key used in localStorage + props. */
  key: TierKey;
  /** Short heading shown on the card. */
  title: string;
  /** Specific model id we'd actually pull (Ollama tag or provider/name). */
  model: string;
  /** Resident size in GiB at runtime (Ollama disk + RAM/VRAM, ballpark). */
  sizeGb: number;
  /** Marketing one-liner. */
  blurb: string;
  /** Whether this tier needs network access at inference time. */
  cloud: boolean;
}

/**
 * Four-tier catalog locked into the wizard. Adding a new model means
 * extending this list and adding a matching `TierKey`. Sizes are the
 * resident memory footprint (Q4 quant for Ollama tiers) — not the
 * download size, which is smaller.
 */
export const TIER_CATALOG: readonly ModelTier[] = [
  {
    key: 'small',
    title: 'Free local — small',
    model: 'llama3.2:3b',
    sizeGb: 2.0,
    blurb: 'Respuestas rápidas en cualquier portátil moderno. Calidad básica.',
    cloud: false,
  },
  {
    key: 'balanced',
    title: 'Best local — balanced',
    model: 'qwen2.5:7b',
    sizeGb: 4.5,
    blurb: 'Calidad sólida para análisis legal. Necesita una GPU o 16+ GB de RAM.',
    cloud: false,
  },
  {
    key: 'large',
    title: 'Best local — large',
    model: 'qwen2.5:32b',
    sizeGb: 20.0,
    blurb: 'Calidad de despacho profesional. Solo equipos con 24+ GB de VRAM o Apple Silicon top.',
    cloud: false,
  },
  {
    key: 'cloud',
    title: 'Best cloud — pay-per-use',
    model: 'anthropic/claude-sonnet-4-6',
    sizeGb: 0,
    blurb: 'Mejor calidad disponible, sin requisitos de hardware. Requiere una API key tuya.',
    cloud: true,
  },
] as const;

export function getTier(key: TierKey): ModelTier {
  const tier = TIER_CATALOG.find((t) => t.key === key);
  if (!tier) {
    throw new Error(`Unknown tier: ${key}`);
  }
  return tier;
}

// ─── Fit vocabulary ──────────────────────────────────────────────────────

export type FitStatus = 'great' | 'well' | 'decent' | 'tight' | 'too-heavy';

/**
 * Thresholds expressed as `host / required` ratios.
 *
 * The ratio uses VRAM when an NVIDIA GPU is present, otherwise the
 * available (not total) system RAM — psutil's ``available`` value
 * already accounts for the OS + background apps, so the bands here are
 * tighter than they would be against raw total RAM.
 *
 * Calibration intent:
 *   - 8 GB total / ~5 GB available laptop  → picks `small`.
 *   - 16 GB total laptop                    → picks `balanced`.
 *   - 24 GB VRAM workstation                → picks `large`.
 *   - 64 GB Apple Silicon                   → picks `large`.
 */
export const FIT_THRESHOLDS = {
  great: 2.0,
  well: 1.5,
  decent: 1.15,
  tight: 0.85,
} as const;

/** Localised label per status — surfaced in the FitBadge component. */
export const FIT_LABELS: Record<FitStatus, string> = {
  great: 'Va sobrado',
  well: 'Va bien',
  decent: 'Va decente',
  tight: 'Justo justo',
  'too-heavy': 'Demasiado pesado',
};

/** Tone token for the FitBadge — maps to the existing Badge tone palette. */
export const FIT_TONES: Record<FitStatus, 'success' | 'amber' | 'danger'> = {
  great: 'success',
  well: 'success',
  decent: 'amber',
  tight: 'amber',
  'too-heavy': 'danger',
};

// ─── Detection ───────────────────────────────────────────────────────────

/**
 * Memory pool the model would actually run from, in GiB.
 *
 * Order of preference:
 *   1. VRAM when a CUDA-capable NVIDIA GPU is present (Ollama runs from
 *      VRAM if there's enough; if not, it falls back to system RAM and
 *      latency tanks, which we model as the RAM tier). We use total VRAM
 *      since the user can free their GPU by closing other apps before
 *      pulling the model.
 *   2. Available system RAM otherwise — psutil's ``available`` already
 *      excludes the OS + active apps, which is the right pool to size
 *      the model against. Apple Silicon's unified memory is reported as
 *      RAM by ``platform``, so this branch covers it too.
 */
function hostMemoryGb(profile: SystemProfile): number {
  if (profile.hasNvidiaGpu && profile.vramGb && profile.vramGb > 0) {
    return profile.vramGb;
  }
  return profile.availableRamGb;
}

/** Map a (host, model) pair to one of the five fit statuses. */
export function fitForModel(profile: SystemProfile, tier: ModelTier): FitStatus {
  // Cloud tier never depends on local hardware — it's always "great".
  // We surface the label anyway so the card looks consistent with the
  // other three.
  if (tier.cloud) return 'great';

  const available = hostMemoryGb(profile);
  const ratio = available / tier.sizeGb;
  if (ratio >= FIT_THRESHOLDS.great) return 'great';
  if (ratio >= FIT_THRESHOLDS.well) return 'well';
  if (ratio >= FIT_THRESHOLDS.decent) return 'decent';
  if (ratio >= FIT_THRESHOLDS.tight) return 'tight';
  return 'too-heavy';
}

/**
 * Pick the single tier the wizard pre-selects.
 *
 * Strategy: walk the local tiers from largest to smallest and pick the
 * first one whose fit is at least "decent" (ratio >= 1.15). If none
 * clear that bar — meaning even the smallest model would be tight or
 * worse — fall back to the cloud tier. The user can always override by
 * clicking another card.
 */
export function recommendTier(profile: SystemProfile): TierKey {
  const localTiers = TIER_CATALOG.filter((t) => !t.cloud).sort((a, b) => b.sizeGb - a.sizeGb);
  const acceptable: FitStatus[] = ['great', 'well', 'decent'];
  for (const tier of localTiers) {
    if (acceptable.includes(fitForModel(profile, tier))) {
      return tier.key;
    }
  }
  return 'cloud';
}
