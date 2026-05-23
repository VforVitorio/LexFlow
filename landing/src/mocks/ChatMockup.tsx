import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@/i18n';

/**
 * #158 — Chat mockup typewriter + streaming + citation pop-in.
 *
 * Triggers a four-phase scripted demo when the section first enters view:
 *   1. user query types out at 28 ms/char with a blinking caret
 *   2. a brief "thinking" dot animation (≈900 ms)
 *   3. the assistant answer streams in at 14 ms/char
 *   4. the source citation pops in with a small scale
 *
 * Once finished the demo stays static; no infinite loop so it doesn't fight
 * for attention with the rest of the landing. Respects
 * `prefers-reduced-motion` by skipping straight to the final state.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Copy + i18n → COPY constant below
 * Per-phase timing → CHAR_USER, CHAR_ASST, THINK_MS constants
 */

interface ChatStrings {
  q: string;
  tool: string;
  body: string;
  src: string;
  model: string;
  you: string;
  asst: string;
}

const COPY: Record<Lang, ChatStrings> = {
  es: {
    q: '¿Qué obligaciones impone la LOPDGDD a los responsables del tratamiento?',
    tool: 'search_corpus({ q: "LOPDGDD responsable tratamiento" })',
    body: 'El responsable del tratamiento debe garantizar la legalidad, transparencia y minimización de los datos. El Art. 28 LOPDGDD desarrolla las obligaciones específicas de protección desde el diseño y por defecto.',
    src: 'LO 3/2018 · Art. 28',
    model: 'llama3.1:8b',
    you: 'Tú',
    asst: 'LexFlow',
  },
  en: {
    q: 'What obligations does the LOPDGDD impose on data controllers?',
    tool: 'search_corpus({ q: "LOPDGDD controller obligations" })',
    body: 'The data controller must ensure lawfulness, transparency and minimisation. Art. 28 LOPDGDD develops the specific data-protection-by-design and by-default obligations.',
    src: 'LO 3/2018 · Art. 28',
    model: 'llama3.1:8b',
    you: 'You',
    asst: 'LexFlow',
  },
};

const CHAR_USER = 28;   // ms per character on the user query
const CHAR_ASST = 14;   // ms per character on the assistant streaming
const THINK_MS = 900;   // tool-call "thinking" plateau

type Phase = 'idle' | 'typing' | 'thinking' | 'streaming' | 'done';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function ChatMockup({ lang }: { lang: Lang }) {
  const t = COPY[lang] ?? COPY.en;
  const ref = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [userTyped, setUserTyped] = useState('');
  const [asstTyped, setAsstTyped] = useState('');

  // Restart the demo if the language changes mid-flight so the typed text
  // doesn't get stuck mixing two languages.
  useEffect(() => {
    setPhase('idle');
    setUserTyped('');
    setAsstTyped('');
  }, [lang]);

  // Trigger on first intersection.
  useEffect(() => {
    if (!ref.current || phase !== 'idle') return;
    if (prefersReducedMotion()) {
      setUserTyped(t.q);
      setAsstTyped(t.body);
      setPhase('done');
      return;
    }
    const node = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          setPhase('typing');
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [phase, t.body, t.q]);

  // Phase driver — one timer per phase, cleaned up on unmount or restart.
  useEffect(() => {
    if (phase === 'idle' || phase === 'done') return;

    let cancelled = false;
    const timeouts: number[] = [];

    function schedule(fn: () => void, ms: number) {
      const id = window.setTimeout(() => { if (!cancelled) fn(); }, ms);
      timeouts.push(id);
    }

    if (phase === 'typing') {
      // Type the user query out character-by-character.
      const target = t.q;
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i += 1;
        setUserTyped(target.slice(0, i));
        if (i < target.length) {
          schedule(tick, CHAR_USER);
        } else {
          schedule(() => setPhase('thinking'), 250);
        }
      };
      schedule(tick, CHAR_USER);
    } else if (phase === 'thinking') {
      schedule(() => setPhase('streaming'), THINK_MS);
    } else if (phase === 'streaming') {
      const target = t.body;
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i += 1;
        setAsstTyped(target.slice(0, i));
        if (i < target.length) {
          schedule(tick, CHAR_ASST);
        } else {
          schedule(() => setPhase('done'), 400);
        }
      };
      schedule(tick, CHAR_ASST);
    }

    return () => {
      cancelled = true;
      timeouts.forEach(window.clearTimeout);
    };
  }, [phase, t.body, t.q]);

  const showCaret = phase === 'typing' || (phase === 'streaming' && asstTyped.length < t.body.length);
  const showTool = phase === 'thinking' || phase === 'streaming' || phase === 'done';
  const showCite = phase === 'done';

  return (
    <div className="lf-mock lf-mock-chat" ref={ref}>
      <div className="lf-chat-header">
        <span className="lf-model-chip">
          <i className="lf-dot lf-dot-g" />
          <code>{t.model}</code>
        </span>
        <span className="lf-chat-meta">Ollama · local</span>
      </div>
      <div className="lf-chat-body">
        <div className="lf-msg lf-msg-user">
          <div className="lf-msg-role">{t.you}</div>
          <div className="lf-msg-text">
            {userTyped}
            {phase === 'typing' && <span className="lf-caret" aria-hidden="true" />}
          </div>
        </div>
        {(phase === 'thinking' || phase === 'streaming' || phase === 'done') && (
          <div className="lf-msg lf-msg-asst">
            <div className="lf-msg-role">{t.asst}</div>
            {showTool && (
              <div className="lf-tool-call lf-chip-in">
                <span className="lf-tool-icon">⚙</span>
                <code>{t.tool}</code>
              </div>
            )}
            {phase === 'thinking' && (
              <div className="lf-thinking" aria-hidden="true">
                <span /><span /><span />
              </div>
            )}
            {(phase === 'streaming' || phase === 'done') && (
              <div className="lf-msg-text">
                {asstTyped}
                {showCaret && <span className="lf-caret" aria-hidden="true" />}
              </div>
            )}
            {showCite && (
              <div className="lf-cite lf-chip-in">
                <span className="lf-cite-icon">§</span>
                <span>{t.src}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
