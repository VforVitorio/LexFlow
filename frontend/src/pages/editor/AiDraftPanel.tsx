/**
 * AiDraftPanel — AI-assisted drafting docked in the editor (#601).
 *
 * Reuses the existing agentic chat stack (sprints 1-4): it streams a grounded
 * answer via `api.chat.send` and accumulates it with `applyChunk`, exactly like
 * ChatPage. The streamed text can be inserted into the document, and the
 * `source` events the RAG loop surfaces are turned into #599 typed-citation
 * nodes — so AI-drafted text lands with clickable, corpus-resolved references.
 *
 * Rendered as a right-docked drawer (no backdrop) so the editor stays
 * interactive: the user can place the cursor, then insert.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * - Streaming/contract → `api.chat.send` + `applyChunk` (`lib/api`).
 * - Source → citation mapping → `citationFromSource` in `./citation-utils`.
 * - Model selection → mirrors ChatPage (`useModels` + `useUi.defaultModel`).
 */
import { useMemo, useRef, useState } from 'react';
import type { Editor, JSONContent } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { Sparkles, X, Send, Loader2, BookOpenText } from 'lucide-react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { applyChunk } from '@/lib/api.mock';
import { useModels } from '@/lib/queries';
import { useUi } from '@/lib/store';
import type { ChatMessage as ChatMessageT, ChatSource } from '@/lib/types';
import { citationFromSource, type CitationAttrs } from './citation-utils';

interface AiDraftPanelProps {
  editor: Editor;
  onClose: () => void;
}

/** Split assistant text into paragraph nodes on blank lines (lazy markdown). */
function draftToBlocks(text: string): JSONContent[] {
  return text
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => ({ type: 'paragraph', content: [{ type: 'text', text: para }] }));
}

interface Preset {
  id: string;
  label: string;
  build: (selection: string) => string;
}

/** Selection-based quick actions. All operate on the current editor selection. */
const PRESETS: Preset[] = [
  { id: 'improve', label: 'Mejorar', build: (s) => `Mejora la redacción de este texto legal, conservando su sentido:\n\n${s}` },
  { id: 'summary', label: 'Resumir', build: (s) => `Resume de forma concisa este texto:\n\n${s}` },
  { id: 'explain', label: 'Explicar', build: (s) => `Explica en lenguaje claro este texto:\n\n${s}` },
];

export function AiDraftPanel({ editor, onClose }: AiDraftPanelProps) {
  const { data: models = [] } = useModels();
  const defaultModel = useUi((s) => s.defaultModel);
  // Same resolution as ChatPage: prefer the configured default if it's
  // available, else the first available provider; empty string = none.
  const model = useMemo(() => {
    const current = models.find((m) => m.id === defaultModel);
    if (current?.available) return defaultModel;
    return models.find((m) => m.available)?.id ?? '';
  }, [models, defaultModel]);

  // Reactive selected-document text (drives the selection presets + indicator).
  const selectionText = useEditorState({
    editor,
    selector: (snap) => {
      const { from, to, empty } = snap.editor.state.selection;
      return empty ? '' : snap.editor.state.doc.textBetween(from, to, '\n');
    },
  });

  const [prompt, setPrompt] = useState('');
  const [stream, setStream] = useState<ChatMessageT | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One thread reused for the whole drafting session (lazy-created).
  const threadIdRef = useRef<string | null>(null);

  const draftText = stream?.role === 'assistant' ? stream.content.join('\n\n').trim() : '';
  const sources: ChatSource[] = stream?.role === 'assistant' ? stream.sources : [];

  const generate = async (text: string) => {
    const content = text.trim();
    if (busy || !content) return;
    if (!model) {
      setError('Configura un modelo en Ajustes › Modelos para usar el asistente.');
      return;
    }
    setBusy(true);
    setStream(null);
    setError(null);
    try {
      let threadId = threadIdRef.current;
      if (!threadId) {
        const created = await api.chat.create({ title: 'Asistente de redacción', model });
        threadId = created.id;
        threadIdRef.current = threadId;
      }
      let current: ChatMessageT | null = null;
      for await (const chunk of api.chat.send(threadId, content, { model })) {
        current = applyChunk(current, chunk);
        setStream(current);
      }
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'No se pudo generar el texto.');
    } finally {
      setBusy(false);
    }
  };

  const runPreset = (preset: Preset) => {
    if (!selectionText) return;
    void generate(preset.build(selectionText));
  };

  const insertDraft = (withCitations: boolean) => {
    if (!draftText) return;
    let chain = editor.chain().focus().insertContent(draftToBlocks(draftText));
    if (withCitations) {
      const citations = sources
        .map(citationFromSource)
        .filter((c): c is CitationAttrs => c !== null);
      if (citations.length > 0) {
        chain = chain.insertContent({ type: 'paragraph', content: [{ type: 'text', text: 'Fuentes: ' }] });
        for (const citation of citations) {
          chain = chain.insertLegalCitation(citation);
        }
      }
    }
    chain.run();
    onClose();
  };

  const citableCount = sources.filter((s) => s.target?.lawId).length;

  return (
    <aside
      role="complementary"
      aria-label="Asistente de redacción"
      className="fixed inset-y-0 right-0 z-40 flex w-[380px] max-w-[92vw] flex-col border-l border-border bg-surface shadow-xl"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="size-4 text-indigo-600" />
        <span className="flex-1 text-[14px] font-semibold">Asistente de redacción</span>
        <Button variant="ghost" size="icon-sm" aria-label="Cerrar asistente" title="Cerrar" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-auto p-4 scrollbar-thin">
        {!model && (
          <div className="rounded-lg border border-amber-300/60 bg-amber-soft px-3 py-2 text-[12.5px] text-amber-700 dark:text-amber-300">
            Configura un modelo en Ajustes › Modelos para usar el asistente.
          </div>
        )}

        {/* Selection-based quick actions. */}
        <section className="space-y-2">
          <div className="label-caps">Acciones sobre la selección</div>
          {selectionText ? (
            <div className="truncate rounded bg-surface-2 px-2 py-1 text-[12px] text-muted" title={selectionText}>
              {selectionText.length} caracteres seleccionados
            </div>
          ) : (
            <div className="text-[12px] text-muted">Selecciona texto en el documento para mejorar, resumir o explicar.</div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant="secondary"
                size="sm"
                disabled={!selectionText || busy || !model}
                onClick={() => runPreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </section>

        {/* Free-text drafting prompt. */}
        <section className="space-y-2">
          <div className="label-caps">Redactar desde una instrucción</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            aria-label="Instrucción para redactar"
            placeholder="p. ej. Redacta una cláusula sobre protección de datos…"
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-muted"
          />
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            icon={busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            disabled={!prompt.trim() || busy || !model}
            onClick={() => void generate(prompt)}
          >
            {busy ? 'Generando…' : 'Generar'}
          </Button>
        </section>

        {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</div>}

        {/* Streamed result. */}
        {(busy || draftText) && (
          <section className="space-y-2">
            <div className="label-caps">Borrador</div>
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-bg px-3 py-2 text-[13px] leading-relaxed">
              {draftText || <span className="text-muted">Generando…</span>}
            </div>

            {sources.length > 0 && (
              <div className="space-y-1">
                <div className="label-caps">Fuentes</div>
                {sources.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded bg-surface-2 px-2 py-1 text-[12px]">
                    <BookOpenText className="size-3.5 shrink-0 text-indigo-600" />
                    <span className="truncate">
                      {s.article ? `${s.article} · ` : ''}
                      {s.law}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {draftText && !busy && (
              <div className="flex flex-wrap gap-1.5">
                <Button variant="primary" size="sm" onClick={() => insertDraft(true)} disabled={citableCount === 0}>
                  {citableCount > 0 ? `Insertar con ${citableCount} cita${citableCount === 1 ? '' : 's'}` : 'Insertar con citas'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => insertDraft(false)}>
                  Insertar solo texto
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
