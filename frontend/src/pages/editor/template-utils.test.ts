/**
 * Tests for `template-utils.ts` (#600).
 *
 * The `{{variable}}` discovery + substitution is the risky logic of the
 * template system — a regression would drop document text or fail to fill a
 * draft. The corpus mapping is covered too so `law.*` placeholders stay wired
 * to the real law fields.
 */

import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/react';
import type { Law } from '@/lib/types';
import { extractVariables, fillTemplate, lawVariableValues, usesLawVariables } from './template-utils';

const doc: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Conforme a {{law.title}}, el ' },
        { type: 'text', text: '{{parte}}', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' declara que {{law.title}}.' },
      ],
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'Firmado: {{ autor }}' }] },
  ],
};

describe('extractVariables', () => {
  it('collects unique variable names across nested text nodes', () => {
    expect(extractVariables(doc).sort()).toEqual(['autor', 'law.title', 'parte']);
  });

  it('returns an empty list when there are no placeholders', () => {
    expect(extractVariables({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual([]);
  });
});

describe('fillTemplate', () => {
  it('replaces every occurrence and leaves unknown variables intact', () => {
    const filled = fillTemplate(doc, { 'law.title': 'Constitución Española', parte: 'demandante' });
    const text = JSON.stringify(filled);
    expect(text).toContain('Conforme a Constitución Española, el ');
    expect(text).toContain('declara que Constitución Española.');
    expect(text).toContain('demandante');
    // `autor` was not provided → its placeholder survives.
    expect(text).toContain('{{ autor }}');
  });

  it('does not mutate the source document', () => {
    const before = JSON.stringify(doc);
    fillTemplate(doc, { 'law.title': 'X' });
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('corpus variables', () => {
  const law = {
    id: 'CE-1978',
    boe: 'BOE-A-1978-31229',
    title: 'Constitución Española',
    short: 'Constitución',
    publicada: '1978-12-29',
  } as Law;

  it('detects law.* usage', () => {
    expect(usesLawVariables(['autor', 'law.title'])).toBe(true);
    expect(usesLawVariables(['autor', 'parte'])).toBe(false);
  });

  it('maps a law to its built-in variable values', () => {
    expect(lawVariableValues(law)).toMatchObject({
      'law.id': 'CE-1978',
      'law.title': 'Constitución Española',
      'law.short': 'Constitución',
      'law.boe': 'BOE-A-1978-31229',
      'law.publicada': '1978-12-29',
    });
  });
});
