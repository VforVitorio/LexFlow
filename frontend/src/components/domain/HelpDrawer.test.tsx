/**
 * Tests for the contextual help drawer (#132).
 *
 * The drawer's job is to:
 *   1. Show a "?" trigger that opens a route-aware dialog.
 *   2. Resolve content via longest-prefix match on the pathname.
 *   3. Close on Esc + backdrop click.
 *
 * We render with a `MemoryRouter` so each test can pin the route and
 * assert the matching copy renders.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HelpDrawer } from './HelpDrawer';

// No TourProvider needed: the drawer's "Repetir tutorial" action now goes
// through the Zustand store (`useTutorialRelaunch`), not @reactour's useTour,
// so the tour provider is no longer an ancestor of the drawer (#712).
function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <HelpDrawer />
    </MemoryRouter>,
  );
}

describe('HelpDrawer trigger', () => {
  it('renders a labelled help button when collapsed', () => {
    renderAt('/home');
    const trigger = screen.getByRole('button', { name: /abrir ayuda/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the dialog on click', async () => {
    renderAt('/home');
    await userEvent.click(screen.getByRole('button', { name: /abrir ayuda/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The opened button reports `aria-expanded: true`.
    expect(
      screen.getByRole('button', { name: /abrir ayuda/i }).getAttribute('aria-expanded'),
    ).toBe('true');
  });
});

describe('HelpDrawer content resolution', () => {
  it('renders the Explorer copy on /explorer', async () => {
    renderAt('/explorer');
    await userEvent.click(screen.getByRole('button', { name: /abrir ayuda/i }));
    expect(screen.getByRole('heading', { name: 'Explorador' })).toBeInTheDocument();
    expect(screen.getByText(/filtros por rango/i)).toBeInTheDocument();
  });

  it('matches the longest prefix — /laws/BOE-... hits the law detail copy', async () => {
    renderAt('/laws/BOE-A-2000-323');
    await userEvent.click(screen.getByRole('button', { name: /abrir ayuda/i }));
    expect(screen.getByRole('heading', { name: 'Detalle de la ley' })).toBeInTheDocument();
  });

  it('falls back to the generic copy on an unknown route', async () => {
    renderAt('/unknown-route');
    await userEvent.click(screen.getByRole('button', { name: /abrir ayuda/i }));
    expect(screen.getByRole('heading', { name: 'LexFlow' })).toBeInTheDocument();
  });
});

describe('HelpDrawer close paths', () => {
  it('closes on Escape', async () => {
    renderAt('/home');
    await userEvent.click(screen.getByRole('button', { name: /abrir ayuda/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('exposes a labelled close button inside the dialog', async () => {
    renderAt('/home');
    await userEvent.click(screen.getByRole('button', { name: /abrir ayuda/i }));
    const closeBtn = screen.getByRole('button', { name: /cerrar ayuda/i });
    await userEvent.click(closeBtn);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
