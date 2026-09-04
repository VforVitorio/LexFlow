/**
 * App-update state machine — poll scheduling, snooze, download/install (#698).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { UpdaterService } from './updater-service';
import { getUpdaterService } from './get-updater-service';
import {
  APP_UPDATE_POLL_INTERVAL_MS,
  msUntilNextPoll,
  persistLastCheckAt,
  readLastCheckAt,
  shouldPoll,
} from './poll-schedule';
import {
  getAppVersion,
  getMockUpdaterService,
  setMockScenario,
  type MockScenario,
} from './mock-updater-service';
import type { AppUpdateUiStatus, DownloadProgress, UpdateInfo } from './types';

export type AppUpdateContextValue = {
  status: AppUpdateUiStatus;
  updateInfo: UpdateInfo | null;
  progress: DownloadProgress;
  errorMessage: string | null;
  hasService: boolean;
  updateNow: () => void;
  remindLater: () => void;
  restartToApply: () => void;
  retry: () => void;
  /** Test helper — run a scheduled poll (clears snooze). */
  runScheduledCheck: () => Promise<void>;
};

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

export function useAppUpdateContext(): AppUpdateContextValue {
  const ctx = useContext(AppUpdateContext);
  if (!ctx) {
    throw new Error('useAppUpdateContext must be used within AppUpdateProvider');
  }
  return ctx;
}

const ACTIVE_UPDATE_STATUSES: AppUpdateUiStatus[] = ['downloading', 'ready', 'restarting'];

function useAppUpdateState(service: UpdaterService | null): AppUpdateContextValue {
  const [status, setStatus] = useState<AppUpdateUiStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<DownloadProgress>({ downloaded: 0, total: null });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const snoozedVersionRef = useRef<string | null>(null);
  const actionGuardRef = useRef(false);
  const statusRef = useRef<AppUpdateUiStatus>('idle');
  const errorPhaseRef = useRef<'download' | 'install' | null>(null);

  statusRef.current = status;

  const applyCheckResult = useCallback((update: UpdateInfo | null) => {
    if (ACTIVE_UPDATE_STATUSES.includes(statusRef.current)) {
      if (update && update.version !== getAppVersion()) {
        setUpdateInfo(update);
      }
      return;
    }

    if (!update || update.version === getAppVersion()) {
      setUpdateInfo(null);
      setStatus('idle');
      return;
    }
    setUpdateInfo(update);
    if (snoozedVersionRef.current === update.version) {
      setStatus('idle');
    } else {
      setStatus('available');
    }
  }, []);

  const runScheduledCheck = useCallback(async () => {
    if (!service) return;
    snoozedVersionRef.current = null;
    try {
      const { update } = await service.check();
      persistLastCheckAt(Date.now());
      applyCheckResult(update);
    } catch {
      persistLastCheckAt(Date.now());
    }
  }, [service, applyCheckResult]);

  useEffect(() => {
    if (!service) return;

    const lastCheckAt = readLastCheckAt();
    if (shouldPoll(lastCheckAt)) {
      void runScheduledCheck();
    }

    const delay = msUntilNextPoll(readLastCheckAt());
    const timeoutId = window.setTimeout(() => {
      void runScheduledCheck();
    }, delay > 0 ? delay : APP_UPDATE_POLL_INTERVAL_MS);

    const intervalId = window.setInterval(() => {
      if (shouldPoll(readLastCheckAt())) {
        void runScheduledCheck();
      }
    }, APP_UPDATE_POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [service, runScheduledCheck]);

  const updateNow = useCallback(() => {
    if (!service || actionGuardRef.current) return;
    actionGuardRef.current = true;
    errorPhaseRef.current = null;
    setErrorMessage(null);
    setProgress({ downloaded: 0, total: null });
    setStatus('downloading');

    void (async () => {
      try {
        await service.download((p) => setProgress(p));
        setStatus('ready');
      } catch (err) {
        errorPhaseRef.current = 'download';
        setErrorMessage(err instanceof Error ? err.message : 'Download failed');
        setStatus('error');
      } finally {
        actionGuardRef.current = false;
      }
    })();
  }, [service]);

  const remindLater = useCallback(() => {
    if (updateInfo) {
      snoozedVersionRef.current = updateInfo.version;
    }
    setStatus('idle');
  }, [updateInfo]);

  const restartToApply = useCallback(() => {
    if (!service || actionGuardRef.current) return;
    actionGuardRef.current = true;
    errorPhaseRef.current = null;
    setStatus('restarting');
    void (async () => {
      try {
        await service.installAndRelaunch();
      } catch (err) {
        errorPhaseRef.current = 'install';
        setErrorMessage(err instanceof Error ? err.message : 'Install failed');
        setStatus('error');
      } finally {
        actionGuardRef.current = false;
      }
    })();
  }, [service]);

  const retry = useCallback(() => {
    if (status !== 'error') return;
    if (errorPhaseRef.current === 'install') {
      restartToApply();
      return;
    }
    updateNow();
  }, [status, updateNow, restartToApply]);

  return {
    status,
    updateInfo,
    progress,
    errorMessage,
    hasService: service !== null,
    updateNow,
    remindLater,
    restartToApply,
    retry,
    runScheduledCheck,
  };
}

type AppUpdateProviderProps = {
  children: ReactNode;
  service?: UpdaterService | null;
};

/** Provides app-update state and registers dev simulation helpers. */
export function AppUpdateProvider({ children, service: serviceProp }: AppUpdateProviderProps) {
  const service = serviceProp ?? getUpdaterService();
  const value = useAppUpdateState(service);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const simulateAppUpdate = async (scenario: MockScenario | 'available') => {
      const mock = getMockUpdaterService();
      mock.setFailAt(undefined);
      setMockScenario(null);
      const ctx = valueRef.current;

      if (scenario === 'available') {
        await ctx.runScheduledCheck();
        return;
      }

      if (scenario === 'error-download') {
        setMockScenario('error-download');
        await ctx.runScheduledCheck();
        return;
      }

      if (scenario === 'error-install') {
        mock.setFailAt('install');
        await ctx.runScheduledCheck();
      }
    };

    window.__lexflowDev = {
      ...window.__lexflowDev,
      simulateAppUpdate,
    };
  }, []);

  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}
