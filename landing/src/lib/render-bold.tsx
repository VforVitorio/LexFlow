import { type ReactNode, Fragment } from 'react';

/**
 * Render an i18n string with `**bold**` markers as <strong> nodes.
 *
 * Lets translation JSON emphasise words without embedding HTML: the string is
 * split on `**...**` and each marked span becomes a bold <strong>. Shared by
 * the section bodies that need it (WhatIs, Layers) — previously copied verbatim
 * in both (#742).
 */
export function renderBold(str: string): ReactNode[] {
  return str.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**')
      ? <strong key={i} style={{ color: 'hsl(var(--fg))', fontWeight: 600 }}>{p.slice(2, -2)}</strong>
      : <Fragment key={i}>{p}</Fragment>
  );
}
