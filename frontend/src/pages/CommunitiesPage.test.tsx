/**
 * Tests for the browse-by-community directory (#671 gap C, map added #846).
 *
 * The page opens on the interactive map; the card grid lives behind the
 * "Lista" toggle. The page has no data fetching (counts are deliberately
 * deferred — see the module docstring in `CommunitiesPage.tsx`), so no
 * QueryClientProvider is needed here. `/explorer` is stubbed with a component
 * that reads back `useSearchParams` so we can assert the exact `?jurisdiction=`
 * value a card/region navigates to, without depending on `ExplorerPage`'s own
 * internals.
 */

import { render, screen, within } from '@testing-library/react';
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

/** The page opens on the map; the card grid is behind the "Lista" toggle. */
async function switchToList() {
  await userEvent.click(screen.getByRole('button', { name: /Lista/i }));
}

describe('CommunitiesPage — map (default view)', () => {
  it('opens on the interactive map', () => {
    renderPage();
    expect(screen.getByRole('group', { name: /Mapa de comunidades/i })).toBeInTheDocument();
  });

  it('clicking a region navigates to the Explorer scoped to its jurisdiction', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Cataluña' }));
    expect(await screen.findByTestId('explorer-stub')).toHaveTextContent('jurisdiction=es-ct');
  });

  it('the Estatal button navigates with jurisdiction=es', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Normativa estatal/i }));
    expect(await screen.findByTestId('explorer-stub')).toHaveTextContent('jurisdiction=es');
  });
});

describe('CommunitiesPage — list view', () => {
  it('renders exactly one card per COMMUNITIES entry', async () => {
    renderPage();
    await switchToList();
    const list = screen.getByRole('list', { name: /Comunidades/i });
    expect(within(list).getAllByRole('button')).toHaveLength(COMMUNITIES.length);
  });

  it('renders every community name and its jurisdiction code', async () => {
    renderPage();
    await switchToList();
    for (const { code, name } of COMMUNITIES) {
      expect(screen.getByText(name)).toBeInTheDocument();
      expect(screen.getByText(code)).toBeInTheDocument();
    }
  });

  it('clicking a community card navigates to the Explorer scoped to its jurisdiction', async () => {
    renderPage();
    await switchToList();
    await userEvent.click(screen.getByText('Cataluña'));
    expect(await screen.findByTestId('explorer-stub')).toHaveTextContent('jurisdiction=es-ct');
  });

  it('Enter key activates a focused card the same as a click', async () => {
    renderPage();
    await switchToList();
    const madridCard = screen.getByRole('button', { name: /Madrid/i });
    madridCard.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByTestId('explorer-stub')).toHaveTextContent('jurisdiction=es-md');
  });
});
