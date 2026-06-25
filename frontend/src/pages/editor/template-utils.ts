/**
 * Pure helpers for the document-template system (#600).
 *
 * The templating layer is deliberately tiny and safe: `{{variable}}` token
 * substitution over the document's text nodes — no expression language, no code
 * eval. Kept free of React/TipTap UI so the substitution logic (the risky part)
 * is unit-testable without booting an editor.
 *
 * --- WHERE TO CHANGE IF THE PLACEHOLDER SYNTAX CHANGES ---
 * `VARIABLE_RE` is the single source of truth for what a placeholder looks like;
 * `extractVariables` (discovery) and `fillTemplate` (substitution) both use it.
 */
import type { JSONContent } from '@tiptap/react';
import type { Law } from '@/lib/types';

/** Matches `{{ name }}` placeholders. Names are word chars + dots (e.g. `law.title`). */
const VARIABLE_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Built-in corpus variables filled from a picked law's metadata. */
export const LAW_VARIABLE_FIELDS = ['law.id', 'law.title', 'law.short', 'law.boe', 'law.publicada'] as const;

/** Visit every text node in a TipTap document, depth-first. */
function walkText(node: JSONContent, visit: (text: string) => void): void {
  if (typeof node.text === 'string') visit(node.text);
  node.content?.forEach((child) => walkText(child, visit));
}

/** Deep-clone a document, transforming the text of every text node. */
function mapText(node: JSONContent, transform: (text: string) => string): JSONContent {
  const next: JSONContent = { ...node };
  if (typeof node.text === 'string') next.text = transform(node.text);
  if (node.content) next.content = node.content.map((child) => mapText(child, transform));
  return next;
}

/** Collect the unique `{{variable}}` names used anywhere in the template body. */
export function extractVariables(content: JSONContent): string[] {
  const names = new Set<string>();
  walkText(content, (text) => {
    for (const match of text.matchAll(VARIABLE_RE)) {
      names.add(match[1]);
    }
  });
  return [...names];
}

/**
 * Substitute `{{variable}}` tokens with their values across all text nodes.
 *
 * Unknown variables are left untouched (so a partially-filled template still
 * shows what's missing rather than silently dropping text).
 */
export function fillTemplate(content: JSONContent, values: Record<string, string>): JSONContent {
  return mapText(content, (text) =>
    text.replace(VARIABLE_RE, (whole, name: string) => (name in values ? values[name] : whole)),
  );
}

/** Whether a template references at least one built-in `law.*` variable. */
export function usesLawVariables(variables: string[]): boolean {
  return variables.some((name) => name.startsWith('law.'));
}

/** Map a picked law to the values of the built-in `law.*` variables. */
export function lawVariableValues(law: Law): Record<string, string> {
  return {
    'law.id': law.id,
    'law.title': law.title,
    'law.short': law.short,
    'law.boe': law.boe,
    'law.publicada': law.publicada,
  };
}
