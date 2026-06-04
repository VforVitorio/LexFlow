import { Fragment } from 'react';
import { Settings as ToolIcon, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui';
import { BrandMark } from '@/components/BrandMark';
import { CitationCard } from './CitationCard';
import type { ChatMessage as ChatMessageT, ChatSource } from '@/lib/types';

export interface ChatMessageProps {
  message: ChatMessageT;
  onSourceClick?: (s: ChatSource) => void;
}

export function ChatMessage({ message, onSourceClick }: ChatMessageProps) {
  if (message.role === 'user') {
    return (
      <div className="self-end max-w-[85%]">
        <div className="rounded-[14px_14px_4px_14px] border border-indigo-200/60 bg-primary-soft px-3.5 py-2.5 text-[14.5px] leading-relaxed text-indigo-900 dark:border-indigo-800 dark:text-indigo-100">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.role === 'tool') {
    return (
      <div className="self-start">
        <div className="inline-flex items-center gap-2.5 rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[12.5px]">
          <ToolIcon className="size-3.5 text-muted" />
          <span className="font-semibold text-indigo-600 dark:text-indigo-300">{message.name}</span>
          <span className="text-muted">(</span>
          <span className="text-muted">
            {Object.entries(message.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}
          </span>
          <span className="text-muted">)</span>
          <span className="text-muted">→</span>
          <span>{message.result}</span>
          <ChevronRight className="ml-1 size-3 text-muted" />
        </div>
      </div>
    );
  }
  // assistant
  return (
    <div className="self-start">
      <div className="mb-2 flex items-center gap-2">
        <BrandMark size={18} />
        <span className="text-[12.5px] font-semibold text-indigo-700 dark:text-indigo-200">LexFlow</span>
        <Badge tone="info" className="text-[10px]">Asistente</Badge>
        {message.streaming && (
          <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-indigo-500" />
            escribiendo…
          </span>
        )}
      </div>
      <div className="text-[14.5px] leading-relaxed">
        {message.content.map((p, i) => <Paragraph key={i} text={p} />)}
      </div>
      {message.sources.length > 0 && (
        <div className="mt-3.5">
          <div className="label-caps mb-1.5">Fuentes</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {message.sources.map((s, i) => (
              <CitationCard key={i} source={s} onClick={() => onSourceClick?.(s)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Tiny markdown renderer for **bold** and `1.` list items — keeps the
 * dependency surface small. Upgrade to react-markdown if you need more.
 *
 * Renders via plain JSX (React auto-escapes text children), so backend
 * content cannot inject HTML even if a tool result or model output ever
 * carries `<script>` or similar payloads.
 */
function Paragraph({ text }: { text: string }) {
  const isList = /^\d+\.\s/.test(text);
  if (isList) {
    const m = text.match(/^(\d+)\.\s+(.*)/);
    if (m) {
      return (
        <div className="mb-2 flex gap-2.5">
          <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-300 shrink-0">{m[1]}.</span>
          <span className="flex-1">{renderBold(m[2])}</span>
        </div>
      );
    }
  }
  return <p className="mb-2 text-pretty">{renderBold(text)}</p>;
}

function renderBold(s: string): React.ReactNode[] {
  const parts = s.split(/(\*\*[^*]+?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
