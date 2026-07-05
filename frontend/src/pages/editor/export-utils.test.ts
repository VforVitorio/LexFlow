/**
 * Tests for the editor export serializers (#861).
 *
 * The Markdown serializer is the pure, dependency-free core — asserted in
 * detail. The DOCX builder is exercised structurally with the real `docx`
 * module (imported statically here; in the app it's dynamic-imported) to
 * confirm the JSON walk maps every node type without throwing.
 */
import { describe, expect, it } from 'vitest';
import * as docx from 'docx';
import type { JSONContent } from '@tiptap/react';
import { documentToMarkdown, documentToDocxBlocks, fileStem } from './export-utils';

const SAMPLE: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Contrato' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Las partes ' },
        { type: 'text', text: 'acuerdan', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' lo ' },
        { type: 'text', text: 'siguiente', marks: [{ type: 'italic' }] },
        { type: 'text', text: ' según ' },
        { type: 'legalCitation', attrs: { label: 'art. 1', lawId: 'CE-1978' } },
      ],
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Uno' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dos' }] }] },
      ],
    },
    {
      type: 'orderedList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Primero' }] }] }],
    },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cita legal' }] }] },
  ],
};

describe('documentToMarkdown', () => {
  const md = documentToMarkdown(SAMPLE);

  it('renders headings with #', () => {
    expect(md).toContain('# Contrato');
  });

  it('applies bold and italic marks', () => {
    expect(md).toContain('**acuerdan**');
    expect(md).toContain('*siguiente*');
  });

  it('renders a resolved legal citation as a link to the law', () => {
    expect(md).toContain('[art. 1](/laws/CE-1978)');
  });

  it('renders bullet and ordered lists', () => {
    expect(md).toContain('- Uno');
    expect(md).toContain('- Dos');
    expect(md).toContain('1. Primero');
  });

  it('prefixes blockquote lines with >', () => {
    expect(md).toContain('> Cita legal');
  });

  it('never emits comment-mark syntax (comments are editorial)', () => {
    const commented: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'texto anotado', marks: [{ type: 'comment', attrs: { commentId: 'x' } }] }],
        },
      ],
    };
    const out = documentToMarkdown(commented);
    expect(out.trim()).toBe('texto anotado');
  });

  it('renders an unresolved citation as plain label (no link)', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'legalCitation', attrs: { label: 'art. 9' } }] }],
    };
    expect(documentToMarkdown(doc).trim()).toBe('art. 9');
  });
});

describe('fileStem', () => {
  it('slugifies a title, stripping accents and punctuation', () => {
    expect(fileStem('Mi Contrató 2025!')).toBe('mi-contrato-2025');
  });

  it('falls back to "documento" for empty/blank titles', () => {
    expect(fileStem('')).toBe('documento');
    expect(fileStem('   ')).toBe('documento');
  });
});

describe('documentToDocxBlocks', () => {
  it('maps every block to a docx Paragraph without throwing', () => {
    const blocks = documentToDocxBlocks(SAMPLE, docx);
    // heading + paragraph + 2 bullet items + 1 ordered item + 1 blockquote line = 6
    expect(blocks).toHaveLength(6);
    for (const block of blocks) {
      expect(block).toBeInstanceOf(docx.Paragraph);
    }
  });

  it('packs a real DOCX file (a valid zip archive)', async () => {
    const document = new docx.Document({ sections: [{ children: documentToDocxBlocks(SAMPLE, docx) }] });
    const buffer = await docx.Packer.toBuffer(document);
    // A .docx is a ZIP container → the first two bytes are the "PK" magic.
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer.length).toBeGreaterThan(500);
  });
});
