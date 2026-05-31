import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Paperclip, BookOpenText, SlidersHorizontal, Send } from 'lucide-react';
import { Button, Chip, Kbd } from '@/components/ui';
import { ChatMessage } from '@/components/domain/ChatMessage';
import { ModelChip } from '@/components/domain/ModelChip';
import { CitationCard } from '@/components/domain/CitationCard';
import { RightRail } from '@/components/shell/RightRail';
import { useChatThreads, useChatThread } from '@/lib/queries';
import { api } from '@/lib/api';
import { applyChunk } from '@/lib/api.mock';
import { useUi } from '@/lib/store';
import { cn, timeAgo } from '@/lib/utils';
import type { ChatMessage as ChatMessageT, ChatSource } from '@/lib/types';

export function ChatPage() {
  const navigate = useNavigate();
  const defaultModel = useUi((s) => s.defaultModel);
  const [activeId, setActiveId] = useState<string>('eipd');
  const [draft, setDraft] = useState('');
  const [stream, setStream] = useState<ChatMessageT | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: threads = [] } = useChatThreads();
  const { data: msgs = [] } = useChatThread(activeId);
  const visible: ChatMessageT[] = stream ? [...msgs, stream] : msgs;

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [visible.length, stream]);

  const send = async () => {
    if (!draft.trim()) return;
    const content = draft;
    setDraft('');
    let current: ChatMessageT | null = null;
    for await (const chunk of api.chat.send(activeId, content, { model: defaultModel })) {
      current = applyChunk(current, chunk);
      setStream(current);
    }
    setStream(null);
    // In a real app: invalidate the thread query so the persisted backend
    // copy replaces the streamed one. With mocks we'd push the message into
    // the seed array — left for the FastAPI backend to handle.
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Conversation rail */}
      <aside className="w-60 shrink-0 overflow-auto border-r border-border bg-bg p-3.5 scrollbar-thin">
        <Button size="sm" icon={<Plus className="size-3.5" />} className="mb-3 w-full">Nueva conversación</Button>
        {threads.length === 0 ? (
          // Empty rail — first time using chat, or the live backend
          // hasn't returned any thread yet. Surfaces the explicit CTA
          // instead of leaving the rail blank below the "Nueva"
          // button.
          <p className="mt-2 px-1 text-[12.5px] text-muted">
            Aún no hay conversaciones. Pulsa <span className="font-semibold text-fg">Nueva conversación</span> para empezar.
          </p>
        ) : (
          groupThreads(threads).map(([label, ts]) => (
            <div key={label}>
              <div className="label-caps mb-1.5 mt-3 first:mt-0">{label}</div>
              {ts.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={cn(
                    'mb-0.5 w-full truncate rounded px-2.5 py-1.5 text-left text-[13px] transition-colors',
                    activeId === t.id ? 'bg-primary-soft font-semibold text-indigo-700 dark:text-indigo-200' : 'hover:bg-surface-2',
                  )}
                >
                  {t.title}
                </button>
              ))}
            </div>
          ))
        )}
      </aside>

      {/* Thread */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-6 py-3">
          <div className="min-w-0">
            <div className="font-display text-[15px] font-semibold">{threads.find((t) => t.id === activeId)?.title ?? 'Conversación'}</div>
            <div className="text-[12px] text-muted">{visible.length} turnos · {visible.filter((m) => m.role === 'assistant').reduce((acc, m) => acc + ('sources' in m ? m.sources.length : 0), 0)} fuentes citadas</div>
          </div>
          <span className="ml-auto"><ModelChip /></span>
        </header>

        <div className="flex-1 overflow-auto py-6 scrollbar-thin">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6">
            {visible.length === 0 ? (
              // No active thread (first time, or the cached id no
              // longer exists). Surface a hint pointing at the input
              // below instead of an empty column.
              <div className="mt-12 text-center text-[13px] text-muted">
                <p className="font-display text-[15px] font-semibold text-fg">Empieza preguntando al corpus</p>
                <p className="mt-1.5">Escribe tu pregunta abajo. Cita un artículo con <span className="font-mono">@</span> o filtra por <span className="font-mono">#tag</span>.</p>
              </div>
            ) : (
              visible.map((m) => (
                <ChatMessage
                  key={m.id}
                  message={m}
                  onSourceClick={(s: ChatSource) => s.target && navigate(`/laws/${s.target.lawId}`)}
                />
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="bg-bg px-6 pb-4 pt-3">
          <div className="mx-auto max-w-3xl rounded-2xl border border-border-strong bg-surface p-3 shadow-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
              placeholder="Pregunta algo al corpus…"
              className="min-h-[44px] w-full resize-none bg-transparent px-1 text-[14.5px] outline-none placeholder:text-muted"
              rows={2}
            />
            <div className="mt-1.5 flex items-center gap-1.5">
              <Button size="icon-sm" variant="ghost" aria-label="Adjuntar" icon={<Paperclip className="size-3.5" />} />
              <Chip icon={<BookOpenText className="size-3" />}>Citar artículo…</Chip>
              <Chip icon={<SlidersHorizontal className="size-3" />}>Solo vigentes</Chip>
              <span className="ml-auto flex items-center gap-2">
                <Kbd>⌘↵</Kbd>
                <Button size="sm" icon={<Send className="size-3.5" />} onClick={send}>Enviar</Button>
              </span>
            </div>
          </div>
        </div>
      </div>

      <RightRail>
        <div className="label-caps mb-3">Fuentes</div>
        <div className="flex flex-col gap-2.5">
          {visible
            .filter((m): m is Extract<ChatMessageT, { role: 'assistant' }> => m.role === 'assistant')
            .flatMap((m) => m.sources)
            .map((s, i) => (
              <CitationCard key={i} source={s} onClick={() => s.target && navigate(`/laws/${s.target.lawId}`)} />
            ))}
        </div>
      </RightRail>
    </div>
  );
}

function groupThreads(threads: { id: string; title: string; updatedAt: string }[]) {
  const today: typeof threads = [];
  const yesterday: typeof threads = [];
  const week: typeof threads = [];
  const now = Date.now();
  for (const t of threads) {
    const age = (now - new Date(t.updatedAt).getTime()) / 86400000;
    if (age < 1) today.push(t);
    else if (age < 2) yesterday.push(t);
    else week.push(t);
  }
  return [
    ['Hoy', today],
    ['Ayer', yesterday],
    ['Esta semana', week],
  ].filter(([, list]) => (list as typeof threads).length > 0) as [string, typeof threads][];
}
