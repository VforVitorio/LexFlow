import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Paperclip, BookOpenText, SlidersHorizontal, Send, Pencil, Trash2 } from 'lucide-react';
import { Button, Chip, Kbd, useConfirm } from '@/components/ui';
import { ChatMessage } from '@/components/domain/ChatMessage';
import { ModelChip } from '@/components/domain/ModelChip';
import { CitationCard } from '@/components/domain/CitationCard';
import { RightRail } from '@/components/shell/RightRail';
import {
  qk,
  useChatThreads,
  useChatThread,
  useCreateChatThread,
  useDeleteChatThread,
  useRenameChatThread,
  useModels,
} from '@/lib/queries';
import { api } from '@/lib/api';
import { applyChunk } from '@/lib/api.mock';
import { useUi } from '@/lib/store';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import type { ChatMessage as ChatMessageT, ChatSource } from '@/lib/types';
import { groupThreads } from './chat/group-threads';

const FALLBACK_THREAD_ID = 'eipd';

export function ChatPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const confirm = useConfirm();
  const defaultModel = useUi((s) => s.defaultModel);
  const setDefaultModel = useUi((s) => s.setDefaultModel);
  const qc = useQueryClient();
  const { data: models = [] } = useModels();
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
  // Pre-fill the composer from a Home suggestion chip (passed via router
  // state) so a "¿Qué exige el art. 28?" chip lands on a chat with the
  // question ready instead of an empty box (#667). Reacts to state changes
  // (not mount-only) and narrows the runtime type before setting.
  const location = useLocation();
  useEffect(() => {
    const incoming = (location.state as { draft?: unknown } | null)?.draft;
    if (typeof incoming === 'string' && incoming.trim().length > 0) {
      setDraft(incoming);
    }
  }, [location.state]);
  const [stream, setStream] = useState<ChatMessageT | null>(null);
  // Optimistic echo of the just-sent user turn. The backend persists it
  // as part of /send, but the thread query only refetches *after* the
  // stream finishes — without this the user's own message wouldn't appear
  // until then (part of the "I send hola and see nothing" bug, #564).
  const [pendingUser, setPendingUser] = useState<ChatMessageT | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Scroll-to-bottom rAF ref: coalesces per-token scroll calls during SSE
  // streaming into a single frame so the scroll stays smooth. The id lets
  // us cancel a queued frame on cleanup (avoids calling into an unmounted DOM).
  const scrollRafRef = useRef<number | null>(null);
  // Inline rename in the rail (a11y #714 — replaces the inaccessible
  // `window.prompt`). When `editingId` is set the row swaps its title
  // button for a focused text input.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingId) renameInputRef.current?.focus();
  }, [editingId]);

  // Auto-select the first *available* model once /models loads. The store
  // no longer hardcodes a cloud model; if the persisted defaultModel isn't
  // a currently-available provider we replace it (or clear it) so chat
  // never POSTs an unconfigured model. The wizard's pull lands here too.
  const availableModel = useMemo(() => models.find((m) => m.available) ?? null, [models]);
  useEffect(() => {
    if (models.length === 0) return;
    const current = models.find((m) => m.id === defaultModel);
    const isUsable = current?.available ?? false;
    if (!isUsable) setDefaultModel(availableModel?.id ?? '');
  }, [models, defaultModel, availableModel, setDefaultModel]);

  const { data: threads = [] } = useChatThreads();
  const { data: msgs = [] } = useChatThread(activeId);
  // Audit #463 — live thread CRUD. The "Nueva conversación" button
  // calls ``create`` and navigates to the new id; rename/delete are
  // exposed via tiny inline buttons next to each row in the rail.
  const createThread = useCreateChatThread();
  const renameThread = useRenameChatThread();
  const deleteThread = useDeleteChatThread();
  // Audit #453 — during SSE streaming the component re-renders on every
  // token. These derived values used to recompute per render (a linear
  // `threads` scan for the title, a full-history walk for the sources
  // counter, and a fresh `visible` array). Memoizing keeps them stable
  // across stream chunks without changing behaviour.
  const visible: ChatMessageT[] = useMemo(() => {
    const out = [...msgs];
    if (pendingUser) out.push(pendingUser);
    if (stream) out.push(stream);
    return out;
  }, [msgs, pendingUser, stream]);
  const threadsById = useMemo(() => new Map(threads.map((th) => [th.id, th])), [threads]);
  // Committed messages only: sources are fixed once a message lands, so
  // the in-flight `stream` never changes this count.
  const sourcesCited = useMemo(
    () => msgs.reduce((acc, m) => acc + (m.role === 'assistant' && 'sources' in m ? m.sources.length : 0), 0),
    [msgs],
  );

  // Scroll to bottom whenever visible messages change or a stream token
  // arrives. `stream` fires on every SSE token, so we coalesce rapid calls
  // into a single rAF: cancel the pending frame and reschedule, then run
  // scrollIntoView inside the frame. Behaviour is unchanged for the common
  // case (new message/turn) — the rAF just prevents per-token scroll jank.
  useEffect(() => {
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      bottomRef.current?.scrollIntoView?.({ block: 'end' });
    });
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [visible.length, stream]);

  const startNewThread = async () => {
    // Audit #463 — replace the legacy "navigate to empty rail" stub
    // with a real create call. The mutation invalidates the threads
    // list so the new row appears in the rail on the next tick.
    try {
      const created = await createThread.mutateAsync({ model: defaultModel });
      setDraft('');
      selectThread(created.id);
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : 'Error desconocido';
      toast({ tone: 'danger', title: t('chat.createFailed'), message });
    }
  };

  const startRename = (threadId: string, currentTitle: string) => {
    setEditValue(currentTitle);
    setEditingId(threadId);
  };

  const commitRename = async (threadId: string, currentTitle: string) => {
    const trimmed = editValue.trim();
    setEditingId(null);
    if (!trimmed || trimmed === currentTitle) return;
    try {
      await renameThread.mutateAsync({ threadId, title: trimmed });
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : 'Error desconocido';
      toast({ tone: 'danger', title: t('chat.renameFailed'), message });
    }
  };

  const handleDelete = async (threadId: string, title: string) => {
    const ok = await confirm({
      title: t('common.delete'),
      message: t('chat.deleteConfirm', { title }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteThread.mutateAsync(threadId);
      if (activeId === threadId) navigate('/chat');
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : 'Error desconocido';
      toast({ tone: 'danger', title: t('chat.deleteFailed'), message });
    }
  };

  const send = async () => {
    // Audit #409: previous code had no in-flight guard, so double-Enter
    // raced two streams and overwrote `setStream`. The early-return on
    // `sending` is the simple fix; the `finally` block guarantees the
    // typing indicator clears even when the generator throws.
    if (sending || !draft.trim()) return;
    // No usable model → tell the user to configure one instead of POSTing
    // an unconfigured model and silently getting an empty reply (#564).
    if (!defaultModel || !availableModel) {
      toast({ tone: 'danger', title: t('chat.noModelTitle'), message: t('chat.noModelBody') });
      return;
    }
    // Audit #463 — if the user lands on a stale fallback id with no
    // matching thread in the live backend, transparently create a new
    // one before sending so the first message doesn't 404.
    let target = activeId;
    if (!threadsById.has(target)) {
      try {
        const created = await createThread.mutateAsync({ model: defaultModel });
        target = created.id;
        selectThread(created.id);
      } catch (exc) {
        const message = exc instanceof Error ? exc.message : 'Error desconocido';
        toast({ tone: 'danger', title: t('chat.createFailed'), message });
        return;
      }
    }
    const content = draft;
    setDraft('');
    setSending(true);
    // Optimistically echo the user turn so it shows immediately.
    setPendingUser({ id: `pending-${Date.now()}`, role: 'user', createdAt: new Date().toISOString(), content });
    let current: ChatMessageT | null = null;
    try {
      for await (const chunk of api.chat.send(target, content, { model: defaultModel })) {
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
      // Refetch the thread so the *persisted* user + assistant turns
      // render. Without this the streamed reply vanished the instant
      // `stream` cleared (the core #564 bug). Await the refetch before
      // dropping the optimistic echoes so there's no blank flash.
      setSending(false);
      await qc.invalidateQueries({ queryKey: qk.chatThread(target) });
      void qc.invalidateQueries({ queryKey: qk.chatThreads() });
      setStream(null);
      setPendingUser(null);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Conversation rail */}
      <aside className="w-60 shrink-0 overflow-auto border-r border-border bg-bg p-3.5 scrollbar-thin">
        <Button
          size="sm"
          icon={<Plus className="size-3.5" />}
          className="mb-3 w-full"
          onClick={startNewThread}
          disabled={createThread.isPending}
        >
          {t('chat.newThread')}
        </Button>
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
                <div
                  key={thread.id}
                  className={cn(
                    'group mb-0.5 flex items-center gap-1 rounded px-2.5 py-1.5 transition-colors',
                    activeId === thread.id ? 'bg-primary-soft' : 'hover:bg-surface-2',
                  )}
                >
                  {editingId === thread.id ? (
                    <input
                      ref={renameInputRef}
                      aria-label={t('chat.renameAria', { title: thread.title })}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitRename(thread.id, thread.title)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(thread.id, thread.title);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-indigo-400 bg-surface px-1.5 py-0.5 text-[13px] outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  ) : (
                    <button
                      onClick={() => selectThread(thread.id)}
                      className={cn(
                        'min-w-0 flex-1 truncate text-left text-[13px]',
                        activeId === thread.id && 'font-semibold text-indigo-700 dark:text-indigo-200',
                      )}
                    >
                      {thread.title}
                    </button>
                  )}
                  <button
                    aria-label={t('chat.renameAria', { title: thread.title })}
                    className="rounded p-1 text-muted opacity-0 hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 group-hover:opacity-100"
                    onClick={() => startRename(thread.id, thread.title)}
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    aria-label={t('chat.deleteAria', { title: thread.title })}
                    className="rounded p-1 text-muted opacity-0 hover:text-rose-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 group-hover:opacity-100 dark:hover:text-rose-400"
                    onClick={() => handleDelete(thread.id, thread.title)}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
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
                  onSourceClick={(s: ChatSource) => s.target && navigate(`/laws/${encodeURIComponent(s.target.lawId)}`)}
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
                // Enter sends; Shift+Enter (native) and Ctrl/Cmd+Enter
                // insert a newline. `isComposing` guards IME input (#571).
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                if (e.shiftKey) return; // native newline
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  const ta = e.currentTarget;
                  const { selectionStart, selectionEnd } = ta;
                  setDraft((d) => d.slice(0, selectionStart) + '\n' + d.slice(selectionEnd));
                  requestAnimationFrame(() => {
                    ta.selectionStart = ta.selectionEnd = selectionStart + 1;
                  });
                  return;
                }
                e.preventDefault();
                if (!sending) send();
              }}
              placeholder={t('chat.placeholder')}
              className="min-h-[44px] w-full resize-none bg-transparent px-1 text-[14.5px] outline-none placeholder:text-muted disabled:opacity-60"
              rows={2}
              disabled={sending}
            />
            <div className="mt-1.5 flex items-center gap-1.5">
              {/* Composer feature stubs — not wired yet (tracked in #564);
                  marked "próximamente" so they don't read as broken. */}
              <Button size="icon-sm" variant="ghost" disabled title={t('chat.comingSoon')} aria-label={t('chat.attach')} icon={<Paperclip className="size-3.5" />} />
              <span title={t('chat.comingSoon')} className="opacity-50">
                <Chip icon={<BookOpenText className="size-3" />}>{t('chat.citeArticle')}</Chip>
              </span>
              <span title={t('chat.comingSoon')} className="opacity-50">
                <Chip icon={<SlidersHorizontal className="size-3" />}>{t('chat.onlyInForce')}</Chip>
              </span>
              <span className="ml-auto flex items-center gap-2">
                <span className="text-[11px] text-muted">{t('chat.enterHint')}</span>
                <Kbd>↵</Kbd>
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
              <CitationCard key={i} source={s} onClick={() => s.target && navigate(`/laws/${encodeURIComponent(s.target.lawId)}`)} />
            ))}
        </div>
      </RightRail>
    </div>
  );
}

