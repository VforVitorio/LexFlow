/**
 * Tests for the model-wizard tiering logic (#118).
 *
 * These are pure-function tests over the `(profile → fit, tier)` map,
 * so they double as a living spec of what each hardware class should
 * see when they open the wizard. New hardware classes go here first.
 */

import { describe, expect, it } from 'vitest';
import {
  FIT_LABELS,
  TIER_CATALOG,
  fitForModel,
  getTier,
  recommendTier,
} from './model-tiering';
import type { SystemProfile } from './types';

const baseProfile: SystemProfile = {
  totalRamGb: 16,
  availableRamGb: 10,
  cpuCores: 8,
  hasNvidiaGpu: false,
  vramGb: null,
  gpuName: null,
  isAppleSilicon: false,
  platform: 'linux',
  ollamaRunning: false,
  ollamaModels: [],
  lmstudioRunning: false,
};

/**
 * Test-fixture helper. When the caller only overrides `totalRamGb` we
 * auto-derive `availableRamGb` as ~63% of it — the typical free-memory
 * footprint on a Linux/Windows box after the OS and a browser. Apple
 * Silicon would land a bit lower. Override `availableRamGb` explicitly
 * to bypass the derivation.
 */
function profile(overrides: Partial<SystemProfile>): SystemProfile {
  const totalRamGb = overrides.totalRamGb ?? baseProfile.totalRamGb;
  const availableRamGb =
    overrides.availableRamGb ?? Math.round(totalRamGb * 0.63 * 10) / 10;
  return { ...baseProfile, ...overrides, totalRamGb, availableRamGb };
}

// ─── recommendTier ──────────────────────────────────────────────────────

describe('recommendTier', () => {
  it('picks small on a low-RAM laptop (8 GB RAM, no GPU)', () => {
    expect(recommendTier(profile({ totalRamGb: 8 }))).toBe('small');
  });

  it('picks balanced on a 16 GB RAM laptop without GPU', () => {
    expect(recommendTier(profile({ totalRamGb: 16 }))).toBe('balanced');
  });

  it('picks balanced on a desktop with a midrange GPU (12 GB VRAM)', () => {
    expect(
      recommendTier(
        profile({ totalRamGb: 32, hasNvidiaGpu: true, vramGb: 12, gpuName: 'RTX 4070' }),
      ),
    ).toBe('balanced');
  });

  it('picks large on a workstation GPU (24 GB VRAM)', () => {
    expect(
      recommendTier(
        profile({ totalRamGb: 64, hasNvidiaGpu: true, vramGb: 24, gpuName: 'RTX 4090' }),
      ),
    ).toBe('large');
  });

  it('picks large on a high-RAM Apple Silicon Mac (64 GB unified)', () => {
    expect(
      recommendTier(
        profile({ totalRamGb: 64, isAppleSilicon: true, platform: 'darwin' }),
      ),
    ).toBe('large');
  });

  it('falls back to cloud when even small does not fit (4 GB RAM)', () => {
    // 4 GB / 2 GB = 2.0 ratio for small, which is "great" — verify the
    // floor with an extreme case.
    expect(recommendTier(profile({ totalRamGb: 1 }))).toBe('cloud');
  });

  it('ignores GPU when VRAM is zero (driver oddity)', () => {
    expect(
      recommendTier(profile({ totalRamGb: 8, hasNvidiaGpu: true, vramGb: 0 })),
    ).toBe('small');
  });
});

// ─── fitForModel ────────────────────────────────────────────────────────

describe('fitForModel', () => {
  it('returns great when the host pool is at least 2× the model size', () => {
    const small = getTier('small'); // 2 GB; 8 GB total → 5.04 avail → ratio 2.52
    expect(fitForModel(profile({ totalRamGb: 8 }), small)).toBe('great');
  });

  it('returns well when ratio is in [1.5, 2.0)', () => {
    const small = getTier('small'); // 2 GB → need 3.0-3.99 available
    expect(fitForModel(profile({ availableRamGb: 3.5 }), small)).toBe('well');
  });

  it('returns decent when ratio is in [1.15, 1.5)', () => {
    const balanced = getTier('balanced'); // 4.5 GB → need 5.18-6.74 available
    expect(fitForModel(profile({ availableRamGb: 6.0 }), balanced)).toBe('decent');
  });

  it('returns tight when ratio is in [0.85, 1.15)', () => {
    const balanced = getTier('balanced'); // 4.5 GB → need 3.83-5.17 available
    expect(fitForModel(profile({ availableRamGb: 4.0 }), balanced)).toBe('tight');
  });

  it('returns too-heavy when ratio is below 0.85', () => {
    const large = getTier('large'); // 20 GB → 5 GB avail → 0.25 ratio
    expect(fitForModel(profile({ availableRamGb: 5 }), large)).toBe('too-heavy');
  });

  it('uses VRAM, not available RAM, when an NVIDIA GPU is present', () => {
    const balanced = getTier('balanced'); // 4.5 GB
    // 8 GB VRAM beats 2 GB available RAM → ratio 1.78 → "well".
    expect(
      fitForModel(
        profile({ availableRamGb: 2, hasNvidiaGpu: true, vramGb: 8 }),
        balanced,
      ),
    ).toBe('well');
  });

  it('treats the cloud tier as always great regardless of host', () => {
    const cloud = getTier('cloud');
    expect(fitForModel(profile({ totalRamGb: 2 }), cloud)).toBe('great');
  });
});

// ─── Catalog invariants ─────────────────────────────────────────────────

describe('TIER_CATALOG', () => {
  it('has exactly one cloud tier', () => {
    const cloudCount = TIER_CATALOG.filter((t) => t.cloud).length;
    expect(cloudCount).toBe(1);
  });

  it('has unique keys', () => {
    const keys = TIER_CATALOG.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('orders local tiers by ascending size', () => {
    const localSizes = TIER_CATALOG.filter((t) => !t.cloud).map((t) => t.sizeGb);
    const sorted = [...localSizes].sort((a, b) => a - b);
    expect(localSizes).toEqual(sorted);
  });
});

// ─── Labels ─────────────────────────────────────────────────────────────

describe('FIT_LABELS', () => {
  it('uses the agreed Spanish vocabulary', () => {
    expect(FIT_LABELS.great).toBe('Va sobrado');
    expect(FIT_LABELS.well).toBe('Va bien');
    expect(FIT_LABELS.decent).toBe('Va decente');
    expect(FIT_LABELS.tight).toBe('Justo justo');
    expect(FIT_LABELS['too-heavy']).toBe('Demasiado pesado');
  });
});
