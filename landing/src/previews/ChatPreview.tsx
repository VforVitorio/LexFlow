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

interface Props { lang: Lang; }

export function ChatPreview({ lang }: Props) {
  const t = COPY[lang] ?? COPY.en;
  const sources = lang === 'es' ? SOURCES_ES : SOURCES_EN;
  const threads = lang === 'es' ? THREADS_ES : THREADS_EN;
  const userText = USER_QUERY[lang] ?? USER_QUERY.en;
  const asstText = ASST_REPLY[lang] ?? ASST_REPLY.en;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const reduceMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  ).current;
  const [phase, setPhase] = useState<Phase>('idle');
  const [userChars, setUserChars] = useState(0);
  const [asstChars, setAsstChars] = useState(0);
  const [paused, setPaused] = useState(false);
  // Sources should not show up until the matching cite marker has been
  // typed out. We compute revealed source ids from how far asstChars has
  // walked past each `{cite:sN}` marker in the source text.
  const revealedSources = useMemo(() => {
    if (phase === 'done' || reduceMotion) return new Set(sources.map((s) => s.id));
    const revealed = new Set<string>();
    let i = 0;
    let outIdx = 0;
    while (i < asstText.length && outIdx <= asstChars) {
      if (asstText.startsWith('{cite:', i)) {
        const end = asstText.indexOf('}', i);
        if (end === -1) break;
        const id = asstText.slice(i + 6, end);
        if (outIdx <= asstChars) revealed.add(id);
        i = end + 1;
      } else {
        i++;
        outIdx++;
      }
    }
    return revealed;
  }, [asstChars, asstText, phase, reduceMotion, sources]);

  // Kick off when the preview crosses the viewport. Stays observed so the
  // loop can pause/resume if the user scrolls away and back.
  useEffect(() => {
    if (reduceMotion) { setPhase('done'); return; }
    const el = wrapperRef.current;
    if (!el || typeof window === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? false),
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduceMotion]);

  // The animation loop. One useEffect, one bag of timers — clear them all
  // on cleanup so React.StrictMode's double-invoke doesn't leak intervals.
  useEffect(() => {
    if (reduceMotion || !inView || paused) return;
    let cancelled = false;
    const timers: number[] = [];

    function run() {
      if (cancelled) return;
      setPhase('userTyping');
      setUserChars(0);
      setAsstChars(0);

      // Type the user query at ~30 chars/sec.
      let uc = 0;
      const uTimer = window.setInterval(() => {
        if (cancelled) return;
        uc += 1;
        setUserChars(uc);
        if (uc >= userText.length) {
          window.clearInterval(uTimer);
          timers.push(window.setTimeout(() => {
            if (cancelled) return;
            setPhase('pause');
            timers.push(window.setTimeout(() => {
              if (cancelled) return;
              setPhase('asstTyping');
              let ac = 0;
              // Assistant prints faster (~55 chars/sec) so the reply
              // doesn't drag — most users stop reading at 2-3 lines.
              const aTimer = window.setInterval(() => {
                if (cancelled) return;
                ac += 1;
                setAsstChars(ac);
                if (ac >= asstText.length) {
                  window.clearInterval(aTimer);
                  timers.push(window.setTimeout(() => {
                    if (cancelled) return;
                    setPhase('done');
                    // Hold the completed state for a beat, then restart.
                    timers.push(window.setTimeout(() => {
                      if (cancelled) return;
                      run();
                    }, 7000));
                  }, 300));
                }
              }, 18);
              timers.push(aTimer);
            }, 700));
          }, 350));
        }
      }, 32);
      timers.push(uTimer);
    }

    // Tiny delay so the entry animation of the preview card has time to
    // play before we start filling it with text.
    timers.push(window.setTimeout(run, 400));

    return () => {
      cancelled = true;
      for (const t of timers) {
        window.clearTimeout(t);
        window.clearInterval(t);
      }
    };
  }, [inView, paused, reduceMotion, userText, asstText]);

  const showUser = phase !== 'idle';
  const showAsst = phase === 'asstTyping' || phase === 'done';
  const userVisible = reduceMotion || phase === 'done' ? userText : userText.slice(0, userChars);
  const asstShown   = reduceMotion || phase === 'done' ? asstText.length : asstChars;

  return (
    <div
      className="lf-prev lf-prev-chat"
      aria-hidden="true"
      ref={wrapperRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
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
