/**
 * Renders a fragment of legal text as Markdown (#591).
 *
 * The legalize-es bodies carry real Markdown — headings (`######`), GFM
 * tables (`|`), lists, bold — which the article view used to dump as raw
 * source ("###### Disposición adicional única", literal pipes). This wraps
 * `react-markdown` + `remark-gfm` with a theme-token component map so the
 * text reads like a document.
 *
 * Inline-flow note: the default `p` is mapped to a `<span>` so a clause's
 * marker + inline citation superscripts (rendered by `ArticleBlock` around
 * this) stay on the same line as the prose. Block constructs (headings,
 * tables, lists) still render as proper blocks — which is why the caller
 * must wrap this in a `<div>`, not a `<p>` (block-in-`<p>` is invalid HTML).
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Element styling → the `COMPONENTS` map below (theme tokens only).
 */

import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

function Heading({ children }: { children?: ReactNode }) {
  return <strong className="mb-1 mt-3 block font-display text-[15px] font-semibold first:mt-0">{children}</strong>;
}

const COMPONENTS: Components = {
  // Keep prose inline so the clause marker + citation sups flow with it.
  p: ({ children }) => <span>{children}</span>,
  h1: Heading,
  h2: Heading,
  h3: Heading,
  h4: Heading,
  h5: Heading,
  h6: Heading,
  ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border-strong pl-3 text-muted">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[0.92em]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-2">{children}</thead>,
  th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-indigo-600 underline dark:text-indigo-300">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-surface-2 px-1 font-mono text-[0.9em]">{children}</code>,
  hr: () => <hr className="my-3 border-border" />,
};

export function LawMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}
