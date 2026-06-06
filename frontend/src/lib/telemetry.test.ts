/**
 * Tests for the page-view telemetry hook (#371 follow-up).
 *
 * Verifies the two-gate model: events only ship when BOTH the operator
 * (backend ``/telemetry/status``) AND the user (Zustand
 * ``telemetryConsent``) have opted in. Either gate off → no POST.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { useEffect } from 'react';

import { usePageViewTelemetry } from './telemetry';
import { liveTelemetryApi } from './api/telemetry';
import { useUi } from './store';

const eventsSpy = vi.spyOn(liveTelemetryApi, 'events');
const statusSpy = vi.spyOn(liveTelemetryApi, 'status');

function freshClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
}

function renderHookAt(route: string) {
  const client = freshClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(
        MemoryRouter,
        { initialEntries: [route] },
        children,
      ),
    );
  return renderHook(() => usePageViewTelemetry(), { wrapper });
}

beforeEach(() => {
  localStorage.clear();
  eventsSpy.mockReset();
  statusSpy.mockReset();
  eventsSpy.mockResolvedValue({ accepted: 1, enabled: true });
  useUi.setState({ telemetryConsent: false });
});

afterEach(() => {
  useUi.setState({ telemetryConsent: false });
});

describe('usePageViewTelemetry', () => {
  it('does not POST when both gates are off', async () => {
    statusSpy.mockResolvedValue({ enabled: false });
    renderHookAt('/home');
    await new Promise((r) => setTimeout(r, 30));
    expect(eventsSpy).not.toHaveBeenCalled();
  });

  it('does not POST when only the user gate is on', async () => {
    statusSpy.mockResolvedValue({ enabled: false });
    useUi.setState({ telemetryConsent: true });
    renderHookAt('/home');
    await new Promise((r) => setTimeout(r, 30));
    expect(eventsSpy).not.toHaveBeenCalled();
  });

  it('does not POST when only the backend gate is on', async () => {
    statusSpy.mockResolvedValue({ enabled: true });
    renderHookAt('/home');
    await new Promise((r) => setTimeout(r, 30));
    expect(eventsSpy).not.toHaveBeenCalled();
  });

  it('POSTs page_view when both gates are on', async () => {
    statusSpy.mockResolvedValue({ enabled: true });
    useUi.setState({ telemetryConsent: true });
    renderHookAt('/explorer');
    await waitFor(() => expect(eventsSpy).toHaveBeenCalledTimes(1));
    const [batch] = eventsSpy.mock.calls[0];
    expect(batch[0].name).toBe('page_view');
    expect(batch[0].props).toEqual({ path: '/explorer' });
  });

  it('does not double-fire when the location object identity changes but the path stays', async () => {
    statusSpy.mockResolvedValue({ enabled: true });
    useUi.setState({ telemetryConsent: true });

    function ReNavigate() {
      const navigate = useNavigate();
      useEffect(() => {
        // Same path, navigate again → react-router still produces a new
        // location object, but the dedup ref must suppress the POST.
        navigate('/home', { replace: true });
      }, [navigate]);
      usePageViewTelemetry();
      return null;
    }

    const wrapper = () =>
      React.createElement(
        QueryClientProvider,
        { client: freshClient() },
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/home'] },
          React.createElement(
            Routes,
            null,
            React.createElement(Route, { path: '/home', element: React.createElement(ReNavigate) }),
          ),
        ),
      );

    renderHook(() => null, { wrapper });
    await waitFor(() => expect(eventsSpy).toHaveBeenCalledTimes(1));
    // Stabilise: even after extra ticks, the count must remain 1 — the
    // repeated navigation to /home shouldn't add a second event.
    await new Promise((r) => setTimeout(r, 50));
    expect(eventsSpy).toHaveBeenCalledTimes(1);
  });
});
