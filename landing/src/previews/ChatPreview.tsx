/**
 * Landing-native preview that mirrors the SPA's ChatPage.
 *
 * Three columns (thread rail, message thread, source rail), same chrome
 * as the SPA. Conversation is hardcoded — the goal is to communicate the
 * idiom "you ask, it answers with real citations", not to run a real
 * model. Inline `cite` spans light up the matching source card on hover
 * via shared `data-src` ids (pure CSS).
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * SPA reference: frontend/src/pages/ChatPage.tsx
 *                frontend/src/components/domain/ChatMessage.tsx
 *                frontend/src/components/domain/CitationCard.tsx
 * Styles:        landing/src/landing.css   .lf-prev-chat-*
 */

import type { Lang } from '@/i18n';

interface Source {
  id: string;
  lawId: string;
  article: string;
  excerpt: string;
}

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  refs?: string[]; // source ids matching `.id` of the citation cards
}

const SOURCES_ES: Source[] = [
  { id: 's1', lawId: 'LOPDGDD',     article: 'Art. 22',   excerpt: 'Las decisiones basadas únicamente en tratamientos automatizados…' },
  { id: 's2', lawId: 'RGPD',         article: 'Art. 35',   excerpt: 'Cuando un tipo de tratamiento entrañe un alto riesgo…' },
  { id: 's3', lawId: 'LOPDGDD',     article: 'Art. 28',   excerpt: 'El responsable establecerá las garantías adecuadas…' },
];
const SOURCES_EN: Source[] = [
  { id: 's1', lawId: 'LOPDGDD',     article: 'Art. 22',   excerpt: 'Decisions based solely on automated processing…' },
  { id: 's2', lawId: 'GDPR',         article: 'Art. 35',   excerpt: 'Where processing is likely to result in high risk…' },
  { id: 's3', lawId: 'LOPDGDD',     article: 'Art. 28',   excerpt: 'The controller shall implement adequate safeguards…' },
];

const TURNS_ES: Turn[] = [
  { role: 'user',      text: '¿Qué obligaciones hay con tratamiento de datos automatizado?' },
  {
    role: 'assistant',
    text: 'Según la LOPDGDD, las decisiones basadas únicamente en tratamientos automatizados quedan sujetas a salvaguardas concretas{cite:s1}. Cuando el tratamiento implica alto riesgo, el RGPD obliga a una evaluación de impacto previa{cite:s2}. Además, el responsable del fichero debe definir garantías técnicas y organizativas{cite:s3}.',
    refs: ['s1', 's2', 's3'],
  },
];
const TURNS_EN: Turn[] = [
  { role: 'user',      text: 'What are the obligations for automated data processing?' },
  {
    role: 'assistant',
    text: 'Under LOPDGDD, decisions based solely on automated processing are subject to specific safeguards{cite:s1}. When processing is likely high-risk, GDPR requires a prior impact assessment{cite:s2}. The data controller must also define technical and organisational safeguards{cite:s3}.',
    refs: ['s1', 's2', 's3'],
  },
];

const THREADS_ES = [
  { id: 't1', title: 'Decisiones automatizadas', when: 'Hoy', active: true },
  { id: 't2', title: 'Reforma laboral 2024', when: 'Hoy' },
  { id: 't3', title: 'Modelo 720 — sanciones', when: 'Ayer' },
  { id: 't4', title: 'LOPD vs RGPD', when: 'Esta semana' },
];
const THREADS_EN = [
  { id: 't1', title: 'Automated decisions', when: 'Today', active: true },
  { id: 't2', title: '2024 labour reform', when: 'Today' },
  { id: 't3', title: 'Form 720 penalties', when: 'Yesterday' },
  { id: 't4', title: 'LOPD vs GDPR', when: 'This week' },
];

const COPY = {
  es: { newConv: 'Nueva conversación', placeholder: 'Pregunta algo al corpus…', sourcesLabel: 'Fuentes', meta: 'Citas: 3 · LOPDGDD · RGPD', model: 'gpt-4o · BOE-rag' },
  en: { newConv: 'New conversation', placeholder: 'Ask the corpus anything…', sourcesLabel: 'Sources', meta: 'Citations: 3 · LOPDGDD · GDPR', model: 'gpt-4o · BOE-rag' },
} as const;

interface Props { lang: Lang; }

export function ChatPreview({ lang }: Props) {
  const t = COPY[lang] ?? COPY.en;
  const sources = lang === 'es' ? SOURCES_ES : SOURCES_EN;
  const turns = lang === 'es' ? TURNS_ES : TURNS_EN;
  const threads = lang === 'es' ? THREADS_ES : THREADS_EN;
  return (
    <div className="lf-prev lf-prev-chat" aria-hidden="true">
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
          <div className="lf-prev-chat-title">{(lang === 'es' ? threads[0].title : threads[0].title)}</div>
          <div className="lf-prev-chat-meta">{t.meta}</div>
          <span className="lf-prev-chat-model">{t.model}</span>
        </header>
        <div className="lf-prev-chat-thread">
          {turns.map((turn, i) => (
            <div key={i} className={`lf-prev-chat-msg lf-prev-chat-msg-${turn.role}`}>
              {turn.role === 'assistant' ? renderAssistant(turn.text) : turn.text}
            </div>
          ))}
        </div>
        <div className="lf-prev-chat-composer">
          <span className="lf-prev-chat-placeholder">{t.placeholder}</span>
          <span className="lf-prev-chat-kbd">⌘↵</span>
        </div>
      </div>
      <aside className="lf-prev-chat-sources">
        <div className="label-caps lf-prev-chat-sources-label">{t.sourcesLabel}</div>
        {sources.map((s) => (
          <div key={s.id} className="lf-prev-card lf-prev-chat-source" data-src={s.id}>
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
 * Render assistant text with inline `{cite:sN}` markers turned into small
 * superscript pills that match the source-card `data-src`. CSS handles
 * the hover-highlight cross-link.
 */
function renderAssistant(text: string) {
  const parts = text.split(/(\{cite:[^}]+\})/g);
  return parts.map((part, i) => {
    const m = part.match(/^\{cite:([^}]+)\}$/);
    if (!m) return <span key={i}>{part}</span>;
    return <sup key={i} className="lf-prev-chat-cite" data-cite={m[1]}>{m[1].slice(1)}</sup>;
  });
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
