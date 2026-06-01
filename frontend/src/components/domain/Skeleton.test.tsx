/**
 * Tests for the Skeleton primitives (#90).
 *
 * Skeletons are visual placeholders, so the assertions focus on the
 * contract that callers depend on:
 *   - the base block renders a single `aria-hidden` element with the
 *     animate-pulse class so screen readers skip it.
 *   - the row/line variants render the requested count.
 *   - the canvas variant surfaces its hint when provided.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton, SkeletonCanvas, SkeletonLines, SkeletonRows } from './Skeleton';

describe('Skeleton', () => {
  it('renders an aria-hidden block with animate-pulse', () => {
    const { container } = render(<Skeleton />);
    const block = container.firstElementChild;
    expect(block).not.toBeNull();
    expect(block?.getAttribute('aria-hidden')).toBe('true');
    expect(block?.className).toContain('animate-pulse');
  });

  it('forwards custom classes via the `className` prop', () => {
    const { container } = render(<Skeleton className="h-5 w-12" />);
    expect(container.firstElementChild?.className).toContain('h-5');
    expect(container.firstElementChild?.className).toContain('w-12');
  });
});

describe('SkeletonLines', () => {
  it('renders the requested number of line skeletons', () => {
    const { container } = render(<SkeletonLines count={5} />);
    // Each line is a child of the wrapper div.
    const wrapper = container.firstElementChild;
    expect(wrapper?.children).toHaveLength(5);
  });

  it('defaults to 4 lines when count is omitted', () => {
    const { container } = render(<SkeletonLines />);
    expect(container.firstElementChild?.children).toHaveLength(4);
  });
});

describe('SkeletonRows', () => {
  it('renders the requested number of row skeletons', () => {
    const { container } = render(<SkeletonRows count={3} />);
    expect(container.firstElementChild?.children).toHaveLength(3);
  });

  it('marks the container as aria-busy', () => {
    const { container } = render(<SkeletonRows count={2} />);
    expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('true');
  });
});

describe('SkeletonCanvas', () => {
  it('renders without a hint when none is passed', () => {
    render(<SkeletonCanvas />);
    expect(screen.queryByText(/grafo/i)).toBeNull();
  });

  it('surfaces the hint text when provided', () => {
    render(<SkeletonCanvas hint="Construyendo grafo, ~30s…" />);
    expect(screen.getByText('Construyendo grafo, ~30s…')).toBeInTheDocument();
  });
});
