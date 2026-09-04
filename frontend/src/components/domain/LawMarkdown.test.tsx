/**
 * Tests for `LawMarkdown` (#886 S2.3).
 *
 * External links rendered from legal-text Markdown must carry
 * `rel="noopener noreferrer"` alongside `target="_blank"` to prevent
 * reverse-tabnabbing from corpus/law/AI-authored content.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LawMarkdown } from './LawMarkdown';

describe('LawMarkdown', () => {
  it('renders external links with target="_blank" and rel="noopener noreferrer"', () => {
    render(<LawMarkdown>{'[BOE](https://www.boe.es)'}</LawMarkdown>);
    const link = screen.getByRole('link', { name: 'BOE' });
    expect(link).toHaveAttribute('target', '_blank');
    const rel = link.getAttribute('rel') ?? '';
    expect(rel.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
  });
});
