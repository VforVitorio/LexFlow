import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import type { ChatMessage as ChatMessageT, ChatSource } from '@/lib/types';

const FALLBACK_THREAD_ID = 'eipd';

export function ChatPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const defaultModel = useUi((s) => s.defaultModel);
  // Audit #409 — read the URL param so deep links like `/chat/legal-x`
  // honour the thread id. The page used to hardcode 'eipd' and silently
  // ignore the param registered on the route. Internal navigation pushes
  // through `selectThread` so the URL stays in sync.
  const { threadId } = useParams<{ threadId?: string }>();
  const [activeId, setActiveId] = useState<string>(threadId ?? FALLBACK_THREAD_ID);
  useEffect(() => {
    if (threadId && threadId !== activeId) setActiveId(threadId);
  }, [threadId, activeId]);
  const selectThread = (id: string) => {
    setActiveId(id);
    navigate(`/chat/${encodeURIComponent(id)}`);
  };
  const [draft, setDraft] = useState('');
  const [stream, setStream] = useState<ChatMessageT | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: threads = [] } = useChatThreads();
  const { data: msgs = [] } = useChatThread(activeId);
  // Audit #453 — during SSE streaming the component re-renders on every
  // token. These derived values used to recompute per render (a linear
  // `threads` scan for the title, a full-history walk for the sources
  // counter, and a fresh `visible` array). Memoizing keeps them stable
  // across stream chunks without changing behaviour.
  const visible: ChatMessageT[] = useMemo(() => (stream ? [...msgs, stream] : msgs), [msgs, stream]);
  const threadsById = useMemo(() => new Map(threads.map((th) => [th.id, th])), [threads]);
  // Committed messages only: sources are fixed once a message lands, so
  // the in-flight `stream` never changes this count.
  const sourcesCited = useMemo(
    () => msgs.reduce((acc, m) => acc + (m.role === 'assistant' && 'sources' in m ? m.sources.length : 0), 0),
    [msgs],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [visible.length, stream]);

  const send = async () => {
    // Audit #409: previous code had no in-flight guard, so double-Enter
    // raced two streams and overwrote `setStream`. The early-return on
    // `sending` is the simple fix; the `finally` block guarantees the
    // typing indicator clears even when the generator throws.
    if (sending || !draft.trim()) return;
    const content = draft;
    setDraft('');
    setSending(true);
    let current: ChatMessageT | null = null;
    try {
      for await (const chunk of api.chat.send(activeId, content, { model: defaultModel })) {
        current = applyChunk(current, chunk);
        setStream(current);
      }
    } catch (exc) {
      // Surface the failure with a toast and restore the draft so the
      // user can retry without retyping. Without this the indicator
      // hung forever and the draft was silently discarded.
      const message = exc instanceof Error ? exc.message : 'Error desconocido';
      toast({ tone: 'danger', title: 'No se pudo enviar el mensaje', message });
      setDraft(content);
    } finally {
      setStream(null);
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Conversation rail */}
      <aside className="w-60 shrink-0 overflow-auto border-r border-border bg-bg p-3.5 scrollbar-thin">
        <Button size="sm" icon={<Plus className="size-3.5" />} className="mb-3 w-full">{t('chat.newThread')}</Button>
        {threads.length === 0 ? (
          // Empty rail — first time using chat, or the live backend
          // hasn't returned any thread yet. Surfaces the explicit CTA
          // instead of leaving the rail blank below the "Nueva"
          // button.
          <p className="mt-2 px-1 text-[12.5px] text-muted">
            {t('chat.emptyRailPre')} <span className="font-semibold text-fg">{t('chat.newThread')}</span> {t('chat.emptyRailPost')}
          </p>
        ) : (
          groupThreads(threads).map(([bucket, ts]) => (
            <div key={bucket}>
              <div className="label-caps mb-1.5 mt-3 first:mt-0">{t(`chat.groups.${bucket}`)}</div>
              {ts.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => selectThread(thread.id)}
                  className={cn(
                    'mb-0.5 w-full truncate rounded px-2.5 py-1.5 text-left text-[13px] transition-colors',
                    activeId === thread.id ? 'bg-primary-soft font-semibold text-indigo-700 dark:text-indigo-200' : 'hover:bg-surface-2',
                  )}
                >
                  {thread.title}
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
            <div className="font-display text-[15px] font-semibold">{threadsById.get(activeId)?.title ?? t('chat.threadFallback')}</div>
            <div className="text-[12px] text-muted">{t('chat.turns', { n: visible.length })} · {t('chat.sourcesCited', { n: sourcesCited })}</div>
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
                <p className="font-display text-[15px] font-semibold text-fg">{t('chat.startTitle')}</p>
                <p className="mt-1.5">{t('chat.startHintPre')} <span className="font-mono">@</span> {t('chat.startHintMid')} <span className="font-mono">#tag</span>.</p>
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (!sending) send();
                }
              }}
              placeholder={t('chat.placeholder')}
              className="min-h-[44px] w-full resize-none bg-transparent px-1 text-[14.5px] outline-none placeholder:text-muted disabled:opacity-60"
              rows={2}
              disabled={sending}
            />
            <div className="mt-1.5 flex items-center gap-1.5">
              <Button size="icon-sm" variant="ghost" aria-label={t('chat.attach')} icon={<Paperclip className="size-3.5" />} />
              <Chip icon={<BookOpenText className="size-3" />}>{t('chat.citeArticle')}</Chip>
              <Chip icon={<SlidersHorizontal className="size-3" />}>{t('chat.onlyInForce')}</Chip>
              <span className="ml-auto flex items-center gap-2">
                <Kbd>⌘↵</Kbd>
                <Button size="sm" icon={<Send className="size-3.5" />} onClick={send} disabled={sending}>{t('chat.send')}</Button>
              </span>
            </div>
          </div>
        </div>
      </div>

      <RightRail>
        <div className="label-caps mb-3">{t('chat.sources')}</div>
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

/**
 * Bucket threads by recency into stable keys. The keys map to
 * `chat.groups.<key>` in the locale files — the caller translates the
 * label so this stays pure and language-agnostic.
 */
type ThreadBucket = 'today' | 'yesterday' | 'week';

function groupThreads(threads: { id: string; title: string; updatedAt: string }[]) {
  const today: typeof threads = [];
  const yesterday: typeof threads = [];
  const week: typeof threads = [];
  const now = Date.now();
  for (const thread of threads) {
    const age = (now - new Date(thread.updatedAt).getTime()) / 86400000;
    if (age < 1) today.push(thread);
    else if (age < 2) yesterday.push(thread);
    else week.push(thread);
  }
  return [
    ['today', today],
    ['yesterday', yesterday],
    ['week', week],
  ].filter(([, list]) => (list as typeof threads).length > 0) as [ThreadBucket, typeof threads][];
}
