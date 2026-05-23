import type { Lang } from '@/i18n';

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

export function ChatMockup({ lang }: { lang: Lang }) {
  const t = COPY[lang] ?? COPY.en;
  return (
    <div className="lf-mock lf-mock-chat">
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
          <div className="lf-msg-text">{t.q}</div>
        </div>
        <div className="lf-msg lf-msg-asst">
          <div className="lf-msg-role">{t.asst}</div>
          <div className="lf-tool-call">
            <span className="lf-tool-icon">⚙</span>
            <code>{t.tool}</code>
          </div>
          <div className="lf-msg-text">{t.body}</div>
          <div className="lf-cite">
            <span className="lf-cite-icon">§</span>
            <span>{t.src}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
