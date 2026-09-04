/**
 * Tests for the desktop app-update notice (#698).
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppUpdateNotice } from './AppUpdateNotice';
import { AppUpdateProvider, useAppUpdateContext } from '@/lib/updater/use-app-update';
import type { UpdaterService } from '@/lib/updater/updater-service';
import type { DownloadProgress, UpdateInfo } from '@/lib/updater/types';
import { persistLastCheckAt } from '@/lib/updater/poll-schedule';

const FAKE_UPDATE: UpdateInfo = {
  version: '0.99.0',
  currentVersion: '0.1.0',
  notes: 'Nota de prueba\nSegunda línea',
  date: '2026-09-01',
};

function createMockService(overrides: Partial<UpdaterService> = {}): UpdaterService {
  return {
    check: vi.fn(async () => ({ update: FAKE_UPDATE })),
    download: vi.fn(async (onProgress: (p: DownloadProgress) => void) => {
      onProgress({ downloaded: 500_000, total: 1_000_000 });
      onProgress({ downloaded: 1_000_000, total: 1_000_000 });
    }),
    installAndRelaunch: vi.fn(async () => {}),
    ...overrides,
  };
}

function PollTrigger() {
  const { runScheduledCheck } = useAppUpdateContext();
  return (
    <button type="button" onClick={() => void runScheduledCheck()}>
      force-poll
    </button>
  );
}

function renderNotice(service: UpdaterService, route = '/home') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppUpdateProvider service={service}>
        <AppUpdateNotice />
        <PollTrigger />
      </AppUpdateProvider>
    </MemoryRouter>,
  );
}

describe('AppUpdateNotice available', () => {
  it('shows version and release notes after poll', async () => {
    persistLastCheckAt(0);
    renderNotice(createMockService());
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/0\.99\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Nota de prueba/)).toBeInTheDocument();
  });
});

describe('AppUpdateNotice downloading', () => {
  it('shows progress percent as download emits', async () => {
    persistLastCheckAt(0);
    const service = createMockService({
      download: vi.fn(async (onProgress) => {
        onProgress({ downloaded: 250_000, total: 1_000_000 });
        await new Promise((resolve) => setTimeout(resolve, 80));
        onProgress({ downloaded: 1_000_000, total: 1_000_000 });
      }),
    });
    renderNotice(service);
    await userEvent.click(await screen.findByRole('button', { name: /actualizar ahora/i }));
    expect(await screen.findByText(/25\s*%|25%/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/100\s*%|100%/)).toBeInTheDocument();
    });
  });
});

describe('AppUpdateNotice ready', () => {
  it('restart button calls installAndRelaunch', async () => {
    persistLastCheckAt(0);
    const service = createMockService();
    renderNotice(service);
    await userEvent.click(await screen.findByRole('button', { name: /actualizar ahora/i }));
    await userEvent.click(await screen.findByRole('button', { name: /reiniciar para aplicar/i }));
    await waitFor(() => {
      expect(service.installAndRelaunch).toHaveBeenCalled();
    });
  });

  it('scheduled poll while ready keeps ready state', async () => {
    persistLastCheckAt(0);
    const service = createMockService();
    renderNotice(service);
    await userEvent.click(await screen.findByRole('button', { name: /actualizar ahora/i }));
    expect(await screen.findByRole('button', { name: /reiniciar para aplicar/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /force-poll/i }));
    expect(await screen.findByRole('button', { name: /reiniciar para aplicar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /actualizar ahora/i })).toBeNull();
  });
});

describe('AppUpdateNotice error', () => {
  it('shows error and retry restarts download', async () => {
    persistLastCheckAt(0);
    const service = createMockService({
      download: vi
        .fn()
        .mockRejectedValueOnce(new Error('fallo de red'))
        .mockImplementation(async (onProgress) => {
          onProgress({ downloaded: 1_000_000, total: 1_000_000 });
        }),
    });
    renderNotice(service);
    await userEvent.click(await screen.findByRole('button', { name: /actualizar ahora/i }));
    expect(await screen.findByText(/fallo de red/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    await waitFor(() => {
      expect(service.download).toHaveBeenCalledTimes(2);
    });
  });

  it('retry after install failure calls installAndRelaunch not download', async () => {
    persistLastCheckAt(0);
    const service = createMockService({
      installAndRelaunch: vi
        .fn()
        .mockRejectedValueOnce(new Error('fallo de instalación'))
        .mockResolvedValueOnce(undefined),
    });
    renderNotice(service);
    await userEvent.click(await screen.findByRole('button', { name: /actualizar ahora/i }));
    await userEvent.click(await screen.findByRole('button', { name: /reiniciar para aplicar/i }));
    expect(await screen.findByText(/fallo de instalación/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    await waitFor(() => {
      expect(service.installAndRelaunch).toHaveBeenCalledTimes(2);
    });
    expect(service.download).toHaveBeenCalledTimes(1);
  });
});

describe('AppUpdateNotice remindLater', () => {
  it('hides until the next scheduled poll', async () => {
    persistLastCheckAt(0);
    const service = createMockService();
    renderNotice(service);
    await userEvent.click(await screen.findByRole('button', { name: /recordar más tarde/i }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /force-poll/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('AppUpdateNotice a11y', () => {
  it('uses dialog role when interactive and Escape snoozes on available', async () => {
    persistLastCheckAt(0);
    renderNotice(createMockService());
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
