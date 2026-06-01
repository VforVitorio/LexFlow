/**
 * Tests for `HighlightedSnippet` (#90).
 *
 * The component is presentational but carries a small invariant: it must
 * fall back to plain text when offsets are missing/invalid so it never
 * silently truncates a search snippet. Both branches covered below.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HighlightedSnippet } from './HighlightedSnippet';

describe('HighlightedSnippet', () => {
  it('renders plain text when no match is supplied', () => {
    render(<HighlightedSnippet text="el demandante" />);
    expect(screen.getByText('el demandante')).toBeInTheDocument();
    expect(screen.queryByRole('mark')).toBeNull();
    expect(document.querySelector('mark')).toBeNull();
  });

  it('wraps the matched substring in a <mark>', () => {
    render(<HighlightedSnippet text="el demandante presenta" match={{ start: 3, end: 13 }} />);
    const mark = document.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('demandante');
  });

  it('renders the prefix before the snippet without highlighting it', () => {
    render(
      <HighlightedSnippet
        text="el demandante"
        prefix="Art. 28 — "
        match={{ start: 3, end: 13 }}
      />,
    );
    // The prefix must be in the document but NOT inside <mark>.
    const text = screen.getByText(/Art\. 28/);
    expect(text).toBeInTheDocument();
    expect(document.querySelector('mark')?.textContent).toBe('demandante');
  });

  it('falls back to plain text when offsets are out of bounds', () => {
    render(<HighlightedSnippet text="short" match={{ start: 0, end: 999 }} />);
    expect(document.querySelector('mark')).toBeNull();
  });

  it('falls back to plain text when start >= end', () => {
    render(<HighlightedSnippet text="empty match" match={{ start: 5, end: 5 }} />);
    expect(document.querySelector('mark')).toBeNull();
  });
});
