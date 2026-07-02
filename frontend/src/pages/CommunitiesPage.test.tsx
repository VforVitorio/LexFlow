/**
 * Tests for the browse-by-community directory (#671 gap C).
 *
 * The page has no data fetching (counts are deliberately deferred — see
 * the module docstring in `CommunitiesPage.tsx`), so no QueryClientProvider
 * is needed here. `/explorer` is stubbed with a component that reads back
 * `useSearchParams` so we can assert the exact `?jurisdiction=` value a
 * card navigates to, without depending on `ExplorerPage`'s own internals.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CommunitiesPage } from './CommunitiesPage';
import { COMMUNITIES } from '@/lib/types';

function ExplorerStub() {
  const [params] = useSearchParams();
  return <div data-testid="explorer-stub">jurisdiction={params.get('jurisdiction') ?? 'none'}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/communities']}>
      <Routes>
        <Route path="/communities" element={<CommunitiesPage />} />
        <Route path="/explorer" element={<ExplorerStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CommunitiesPage — grid', () => {
  it('renders exactly one card per COMMUNITIES entry', () => {
    renderPage();
    expect(screen.getAllByRole('button')).toHaveLength(COMMUNITIES.length);
  });

  it('renders every community name and its jurisdiction code', () => {
    renderPage();
    for (const { code, name } of COMMUNITIES) {
      expect(screen.getByText(name)).toBeInTheDocument();
      expect(screen.getByText(code)).toBeInTheDocument();
    }
  });
});

describe('CommunitiesPage — navigation', () => {
  it('clicking a community card navigates to the Explorer scoped to its jurisdiction', async () => {
    renderPage();
    await userEvent.click(screen.getByText('Cataluña'));
    expect(await screen.findByTestId('explorer-stub')).toHaveTextContent('jurisdiction=es-ct');
  });

  it('clicking the Estatal card navigates with jurisdiction=es', async () => {
    renderPage();
    await userEvent.click(screen.getByText('Estatal'));
    expect(await screen.findByTestId('explorer-stub')).toHaveTextContent('jurisdiction=es');
  });

  it('Enter key activates a focused card the same as a click', async () => {
    renderPage();
    const madridCard = screen.getByRole('button', { name: /Madrid/i });
    madridCard.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByTestId('explorer-stub')).toHaveTextContent('jurisdiction=es-md');
  });
});
