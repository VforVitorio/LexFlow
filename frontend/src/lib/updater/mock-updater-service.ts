/**
 * Mock updater for dev/web — simulates check, download, and install (#698).
 */

import type { UpdaterService } from './updater-service';
import type { DownloadProgress, UpdateInfo } from './types';

export type MockFailAt = 'download' | 'install';

export type MockScenario = 'available' | 'error-download' | 'error-install';

type MockUpdaterOptions = {
  failAt?: MockFailAt;
  currentVersion?: string;
};

const MOCK_VERSION = '0.99.0';
const MOCK_NOTES = [
  'Corrección de errores en el explorador.',
  'Mejoras de rendimiento en búsqueda semántica.',
  'Actualización de dependencias de seguridad.',
].join('\n');

let singleton: MockUpdaterService | null = null;
let scenario: MockScenario | null = null;

/** Shared mock instance for dev and `VITE_MOCK_APP_UPDATE`. */
export function getMockUpdaterService(): MockUpdaterService {
  if (!singleton) {
    singleton = new MockUpdaterService();
  }
  return singleton;
}

/** Test/dev helper — force the next operation to fail. */
export function setMockScenario(next: MockScenario | null): void {
  scenario = next;
  if (singleton) {
    singleton.setFailAt(scenario === 'error-download' ? 'download' : scenario === 'error-install' ? 'install' : undefined);
  }
}

export function getAppVersion(): string {
  return (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.1.0';
}

export class MockUpdaterService implements UpdaterService {
  private failAt: MockFailAt | undefined;

  constructor(options: MockUpdaterOptions = {}) {
    this.failAt = options.failAt;
  }

  setFailAt(at: MockFailAt | undefined): void {
    this.failAt = at;
  }

  async check(): Promise<{ update: UpdateInfo | null }> {
    await delay(80);
    const currentVersion = getAppVersion();
    if (scenario === 'error-download' || scenario === 'error-install') {
      scenario = null;
    }
    return {
      update: {
        version: MOCK_VERSION,
        currentVersion,
        notes: MOCK_NOTES,
        date: '2026-09-01',
      },
    };
  }

  async download(onProgress: (progress: DownloadProgress) => void): Promise<void> {
    if (this.failAt === 'download' || scenario === 'error-download') {
      scenario = null;
      throw new Error('Mock download failed');
    }
    const total = 1_000_000;
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await delay(120);
      onProgress({ downloaded: Math.round((total * i) / steps), total });
    }
  }

  async installAndRelaunch(): Promise<void> {
    if (this.failAt === 'install' || scenario === 'error-install') {
      scenario = null;
      throw new Error('Mock install failed');
    }
    await delay(400);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
