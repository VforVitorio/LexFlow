/**
 * Landing-native preview that mirrors the SPA's ChatPage.
 *
 * Three columns (thread rail, message thread, source rail), same chrome
 * as the SPA. Conversation is hardcoded — the goal is to communicate the
 * idiom "you ask, it answers with real citations", not to run a real
 * model.
 *
 * --- Typewriter loop (#185 follow-up) ---
 * On scroll-into-view the preview replays a tiny conversation:
 *   1. user bubble appears (empty)        → 'userTyping'
 *   2. user text types in                 → still 'userTyping'
 *   3. short pause                        → 'pause'
 *   4. assistant bubble appears (empty)   → 'asstTyping'
 *   5. assistant text types in            → 'done'
 * Then ~6 s of stillness, then restart. Respects prefers-reduced-motion
 * (renders the final state directly). Pauses on hover so the user can
 * read the citations without the loop overwriting them.
 *
 * --- Why this isn't a setTimeout pyramid ---
 * The first cut nested setTimeouts/setIntervals inside a useEffect whose
 * deps included `paused` and `inView`. Any hover or scroll-out-of-view
 * cancelled the timers AND restarted from scratch on the next re-run,
 * which the user saw as "se queda a la mitad". This version drives the
 * whole machine from a single rAF/setInterval tick with refs, so hover
 * truly pauses and scrolling out then back in resumes where it stopped.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * SPA reference: frontend/src/pages/ChatPage.tsx
 *                frontend/src/components/domain/ChatMessage.tsx
 *                frontend/src/components/domain/CitationCard.tsx
 * Styles:        landing/src/landing.css   .lf-prev-chat-*
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Lang } from '@/i18n';

interface Source {
  id: string;
  lawId: string;
  article: string;
  excerpt: string;
}

const SOURCES_ES: Source[] = [
  { id: 's1', lawId: 'LOPDGDD', article: 'Art. 22', excerpt: 'Las decisiones basadas únicamente en tratamientos automatizados…' },
  { id: 's2', lawId: 'RGPD',     article: 'Art. 35', excerpt: 'Cuando un tipo de tratamiento entrañe un alto riesgo…' },
  { id: 's3', lawId: 'LOPDGDD', article: 'Art. 28', excerpt: 'El responsable establecerá las garantías adecuadas…' },
];
const SOURCES_EN: Source[] = [
  { id: 's1', lawId: 'LOPDGDD', article: 'Art. 22', excerpt: 'Decisions based solely on automated processing…' },
  { id: 's2', lawId: 'GDPR',    article: 'Art. 35', excerpt: 'Where processing is likely to result in high risk…' },
  { id: 's3', lawId: 'LOPDGDD', article: 'Art. 28', excerpt: 'The controller shall implement adequate safeguards…' },
];

const USER_QUERY = { es: '¿Qué obligaciones hay con tratamiento de datos automatizado?', en: 'What are the obligations for automated data processing?' };
const ASST_REPLY = {
  es: 'Según la LOPDGDD, las decisiones basadas únicamente en tratamientos automatizados quedan sujetas a salvaguardas concretas{cite:s1}. Cuando el tratamiento implica alto riesgo, el RGPD obliga a una evaluación de impacto previa{cite:s2}. Además, el responsable debe definir garantías técnicas y organizativas{cite:s3}.',
  en: 'Under LOPDGDD, decisions based solely on automated processing are subject to specific safeguards{cite:s1}. When processing is likely high-risk, GDPR requires a prior impact assessment{cite:s2}. The data controller must also define technical and organisational safeguards{cite:s3}.',
};

const THREADS_ES = [
  { id: 't1', title: 'Decisiones automatizadas', when: 'Hoy', active: true },
  { id: 't2', title: 'Reforma laboral 2024',     when: 'Hoy' },
  { id: 't3', title: 'Modelo 720 — sanciones',   when: 'Ayer' },
  { id: 't4', title: 'LOPD vs RGPD',             when: 'Esta semana' },
];
const THREADS_EN = [
  { id: 't1', title: 'Automated decisions', when: 'Today',     active: true },
  { id: 't2', title: '2024 labour reform',  when: 'Today' },
  { id: 't3', title: 'Form 720 penalties',  when: 'Yesterday' },
  { id: 't4', title: 'LOPD vs GDPR',        when: 'This week' },
];

const COPY = {
  es: { newConv: 'Nueva conversación', placeholder: 'Pregunta algo al corpus…', sourcesLabel: 'Fuentes', meta: 'Citas: 3 · LOPDGDD · RGPD', model: 'gpt-4o · BOE-rag', caret: '▎' },
  en: { newConv: 'New conversation',   placeholder: 'Ask the corpus anything…', sourcesLabel: 'Sources', meta: 'Citations: 3 · LOPDGDD · GDPR', model: 'gpt-4o · BOE-rag', caret: '▎' },
} as const;

type Phase = 'idle' | 'userTyping' | 'pause' | 'asstTyping' | 'done';

// Tick granularity for the animation. 30 ms gives us ~33 fps which is
// plenty for char-by-char and easy on the main thread.
const TICK_MS = 30;
// Per-phase budgets, expressed in ticks. 1 tick = TICK_MS milliseconds.
const USER_CHARS_PER_TICK = 1;       // ~33 ch/s
const ASST_CHARS_PER_TICK = 2;       // ~66 ch/s
const PAUSE_TICKS_BEFORE_USER = 12;  //  0.36 s settle-in before user types
const PAUSE_TICKS_BEFORE_ASST = 22;  //  0.66 s "thinking" between bubbles
const DONE_HOLD_TICKS = 230;         //  ~7 s before the loop restarts

interface Props { lang: Lang; }

export function ChatPreview({ lang }: Props) {
  const t = COPY[lang] ?? COPY.en;
  const sources = lang === 'es' ? SOURCES_ES : SOURCES_EN;
  const threads = lang === 'es' ? THREADS_ES : THREADS_EN;
  const userText = USER_QUERY[lang] ?? USER_QUERY.en;
  const asstText = ASST_REPLY[lang] ?? ASST_REPLY.en;

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Reduced-motion users see the final frame and the animation never runs.
  const reduceMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  ).current;

  // Visible state that drives the JSX. The tick refs below own the actual
  // animation progression; we mirror them into React state only when the
  // rendered output should change.
  const [phase, setPhase] = useState<Phase>(reduceMotion ? 'done' : 'idle');
  const [userChars, setUserChars] = useState(reduceMotion ? userText.length : 0);
  const [asstChars, setAsstChars] = useState(reduceMotion ? asstText.length : 0);

  // Refs for the tick loop. Survive across re-renders so pause/resume keep
  // their position instead of resetting to zero each time inView flips.
  const phaseRef = useRef<Phase>('idle');
  const userIdxRef = useRef(0);
  const asstIdxRef = useRef(0);
  const phaseTimerRef = useRef(0);   // ticks elapsed inside the current phase
  const pausedRef = useRef(false);
  const inViewRef = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Compute revealed citation source ids from the assistant's current
  // character cursor. Walks the source text up to `asstChars` and bumps
  // every `{cite:sN}` marker it crosses.
  const revealedSources = useMemo(() => {
    if (phase === 'done' || reduceMotion) return new Set(sources.map((s) => s.id));
    const revealed = new Set<string>();
    let i = 0;
    let visible = 0;
    while (i < asstText.length && visible <= asstChars) {
      if (asstText.startsWith('{cite:', i)) {
        const end = asstText.indexOf('}', i);
        if (end === -1) break;
        revealed.add(asstText.slice(i + 6, end));
        i = end + 1;
      } else {
        i++;
        visible++;
      }
    }
    return revealed;
  }, [asstChars, asstText, phase, reduceMotion, sources]);

  // IntersectionObserver flips `inViewRef`. We use a low threshold so the
  // preview kicks in as soon as a sliver crosses the viewport — the bug
  // before was a 0.35 threshold combined with a hover handler that reset
  // progress on every toggle. Now hover only pauses, IO only gates the
  // tick loop.
  useEffect(() => {
    if (reduceMotion) return;
    const el = wrapperRef.current;
    if (!el || typeof window === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? false;
        inViewRef.current = visible;
      },
      { threshold: 0.1, rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduceMotion]);

  // The single tick loop. Runs the whole machine; pause just stops
  // advancing — never resets. Cleanup clears the interval; refs survive.
  useEffect(() => {
    if (reduceMotion) return;
    if (typeof window === 'undefined') return;

    const handle = window.setInterval(() => {
      if (!inViewRef.current) return;   // outside viewport, hold the frame
      if (pausedRef.current) return;    // hovered, hold the frame

      const ph = phaseRef.current;

      if (ph === 'idle') {
        phaseTimerRef.current += 1;
        if (phaseTimerRef.current >= PAUSE_TICKS_BEFORE_USER) {
          phaseTimerRef.current = 0;
          userIdxRef.current = 0;
          asstIdxRef.current = 0;
          setPhase('userTyping');
          phaseRef.current = 'userTyping';
          setUserChars(0);
          setAsstChars(0);
        }
        return;
      }

      if (ph === 'userTyping') {
        userIdxRef.current = Math.min(userIdxRef.current + USER_CHARS_PER_TICK, userText.length);
        setUserChars(userIdxRef.current);
        if (userIdxRef.current >= userText.length) {
          phaseTimerRef.current = 0;
          setPhase('pause');
          phaseRef.current = 'pause';
        }
        return;
      }

      if (ph === 'pause') {
        phaseTimerRef.current += 1;
        if (phaseTimerRef.current >= PAUSE_TICKS_BEFORE_ASST) {
          phaseTimerRef.current = 0;
          setPhase('asstTyping');
          phaseRef.current = 'asstTyping';
        }
        return;
      }

      if (ph === 'asstTyping') {
        asstIdxRef.current = Math.min(asstIdxRef.current + ASST_CHARS_PER_TICK, asstText.length);
        setAsstChars(asstIdxRef.current);
        if (asstIdxRef.current >= asstText.length) {
          phaseTimerRef.current = 0;
          setPhase('done');
          phaseRef.current = 'done';
        }
        return;
      }

      if (ph === 'done') {
        phaseTimerRef.current += 1;
        if (phaseTimerRef.current >= DONE_HOLD_TICKS) {
          // Loop back. idle → userTyping → … on the next ticks.
          phaseTimerRef.current = 0;
          userIdxRef.current = 0;
          asstIdxRef.current = 0;
          setPhase('idle');
          phaseRef.current = 'idle';
        }
        return;
      }
    }, TICK_MS);

    return () => window.clearInterval(handle);
    // Intentionally empty deps — the loop reads everything from refs and
    // must survive language / state changes that don't actually affect it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restart whenever the source text changes (e.g. user flips languages
  // mid-animation). Resetting state explicitly avoids garbled text.
  useEffect(() => {
    if (reduceMotion) {
      setPhase('done');
      setUserChars(userText.length);
      setAsstChars(asstText.length);
      return;
    }
    phaseTimerRef.current = 0;
    userIdxRef.current = 0;
    asstIdxRef.current = 0;
    phaseRef.current = 'idle';
    setPhase('idle');
    setUserChars(0);
    setAsstChars(0);
  }, [userText, asstText, reduceMotion]);

  const showUser = phase !== 'idle';
  const showAsst = phase === 'asstTyping' || phase === 'done';
  const userVisible = reduceMotion || phase === 'done' ? userText : userText.slice(0, userChars);
  const asstShown   = reduceMotion || phase === 'done' ? asstText.length : asstChars;

  return (
    <div
      className="lf-prev lf-prev-chat"
      aria-hidden="true"
      ref={wrapperRef}
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
    >
      <aside className="lf-prev-chat-rail">
        <button type="button" className="lf-prev-chat-new">+ {t.newConv}</button>
        {groupBy(threads, (x) => x.when).map(([label, list]) => (
          <div key={label}>
            <div className="lf-prev-chat-rail-label">{label}</div>
            {list.map((th) => (
              <div key={th.id} className={`lf-prev-chat-rail-item${th.active ? ' active' : ''}`}>
                {th.title}
              </div>
            ))}
          </div>
        ))}
      </aside>
      <div className="lf-prev-chat-main">
        <header className="lf-prev-chat-header">
          <div className="lf-prev-chat-title">{threads[0].title}</div>
          <div className="lf-prev-chat-meta">{t.meta}</div>
          <span className="lf-prev-chat-model">{t.model}</span>
        </header>
        <div className="lf-prev-chat-thread">
          {showUser && (
            <div className="lf-prev-chat-msg lf-prev-chat-msg-user lf-prev-chat-msg-in">
              {userVisible}
              {phase === 'userTyping' && <span className="lf-prev-chat-caret">{t.caret}</span>}
            </div>
          )}
          {phase === 'pause' && (
            <div className="lf-prev-chat-msg lf-prev-chat-msg-assistant lf-prev-chat-msg-in lf-prev-chat-msg-thinking">
              <span className="lf-prev-chat-dot" />
              <span className="lf-prev-chat-dot" />
              <span className="lf-prev-chat-dot" />
            </div>
          )}
          {showAsst && (
            <div className="lf-prev-chat-msg lf-prev-chat-msg-assistant lf-prev-chat-msg-in">
              {renderAssistant(asstText, asstShown)}
              {phase === 'asstTyping' && <span className="lf-prev-chat-caret">{t.caret}</span>}
            </div>
          )}
        </div>
        <div className="lf-prev-chat-composer">
          <span className="lf-prev-chat-placeholder">{t.placeholder}</span>
          <span className="lf-prev-chat-kbd">⌘↵</span>
        </div>
      </div>
      <aside className="lf-prev-chat-sources">
        <div className="label-caps lf-prev-chat-sources-label">{t.sourcesLabel}</div>
        {sources.map((s) => (
          <div
            key={s.id}
            className={`lf-prev-card lf-prev-chat-source${revealedSources.has(s.id) ? ' is-revealed' : ''}`}
            data-src={s.id}
          >
            <div className="lf-prev-chat-source-head">
              <span className="lf-prev-chat-source-law">{s.lawId}</span>
              <span className="lf-prev-chat-source-art">{s.article}</span>
            </div>
            <p className="lf-prev-chat-source-text">{s.excerpt}</p>
          </div>
        ))}
      </aside>
    </div>
  );
}

/**
 * Render assistant text up to `revealed` visible characters (cite markers
 * don't count towards the visible length so the typewriter doesn't stall
 * while it walks over `{cite:sN}`).
 */
function renderAssistant(text: string, revealed: number): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let visible = 0;
  let buf = '';
  let key = 0;
  function flush() {
    if (buf) {
      out.push(<span key={key++}>{buf}</span>);
      buf = '';
    }
  }
  while (i < text.length) {
    if (text.startsWith('{cite:', i)) {
      const end = text.indexOf('}', i);
      if (end === -1) break;
      const id = text.slice(i + 6, end);
      if (visible <= revealed) {
        flush();
        out.push(
          <sup key={key++} className="lf-prev-chat-cite" data-cite={id}>{id.slice(1)}</sup>,
        );
      }
      i = end + 1;
      continue;
    }
    if (visible >= revealed) break;
    buf += text[i];
    visible++;
    i++;
  }
  flush();
  return out;
}

function groupBy<T, K extends string>(items: T[], key: (t: T) => K): [K, T[]][] {
  const out = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(it);
  }
  return [...out.entries()];
}
