/**
 * Tests for the editor template import (#600 upload).
 *
 * `htmlToTiptapContent` is exercised with a schema built from the same
 * extensions the editor uses (`getSchema`), so we assert real node mapping
 * without spinning up a DOM editor. `importFile` is tested end-to-end for
 * Markdown (marked → HTML → schema) and for the unsupported-type guard.
 */
import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { isSupportedImport, htmlToTiptapContent, importFile } from './import-utils';

const schema = getSchema([StarterKit]);

describe('isSupportedImport', () => {
  it('accepts .docx / .md / .markdown', () => {
    expect(isSupportedImport('demanda.docx')).toBe(true);
    expect(isSupportedImport('plantilla.md')).toBe(true);
    expect(isSupportedImport('notas.markdown')).toBe(true);
  });

  it('rejects other types', () => {
    expect(isSupportedImport('foto.png')).toBe(false);
    expect(isSupportedImport('texto.txt')).toBe(false);
  });
});

describe('htmlToTiptapContent', () => {
  it('maps HTML into the editor schema (headings, bold, lists)', () => {
    const json = htmlToTiptapContent(
      '<h1>Contrato</h1><p>Las <strong>partes</strong>.</p><ul><li>Uno</li></ul>',
      schema,
    );
    expect(json.type).toBe('doc');
    const types = (json.content ?? []).map((n) => n.type);
    expect(types).toContain('heading');
    expect(types).toContain('paragraph');
    expect(types).toContain('bulletList');
    expect(JSON.stringify(json)).toContain('bold');
  });
});

describe('importFile', () => {
  it('imports a Markdown file, preserving {{variable}} placeholders', async () => {
    const file = new File(['# Título\n\nUn **párrafo** con {{cliente}}.'], 'demanda.md', {
      type: 'text/markdown',
    });
    const { name, content } = await importFile(file, schema);
    expect(name).toBe('demanda');
    const flat = JSON.stringify(content);
    expect(flat).toContain('Título');
    expect(flat).toContain('{{cliente}}');
  });

  it('rejects an unsupported file type', async () => {
    const file = new File(['x'], 'foto.png', { type: 'image/png' });
    await expect(importFile(file, schema)).rejects.toThrow(/no soportado/i);
  });
});
