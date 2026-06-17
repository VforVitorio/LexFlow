import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, BookOpenText, FileText, Moon, Network, MessagesSquare, BarChart3, Download, Hash } from 'lucide-react';
import { Kbd } from '@/components/ui';
import { useUi } from '@/lib/store';
import { useSearch, useTags } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { HighlightedSnippet } from '@/components/domain/HighlightedSnippet';
import { STATIC_COMMANDS, filterCommands } from './command-palette/commands';

interface PaletteItem {
  id: string;
  group: 'Tags' | 'Leyes' | 'Artículos' | 'Comandos';
  icon: React.ReactNode;
  title: string;
  /** Plain text or rich node (e.g. `<HighlightedSnippet>` for search hits). */
  subtitle?: React.ReactNode;
  kbd?: string;
  run: () => void;
}

export function CommandPalette() {
  const paletteOpen = useUi((s) => s.paletteOpen);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (paletteOpen) {
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQ('');
    }
  }, [paletteOpen]);

  // Audit #409: ``active`` used to be set to ``0`` only on
  // ``paletteOpen``; typing past the result count left ``active``
  // pointing into the void, so ``Enter`` became a no-op. Resetting
  // whenever the query changes guarantees Enter always runs the
  // top item even after the list shortens.
  useEffect(() => {
    setActive(0);
  }, [q]);

  const { data: searchData } = useSearch(q);
  const { data: vocab = [] } = useTags();

  // Build the palette item list inside a single memo so the keydown
  // effect below doesn't re-subscribe on every render
  // (react-hooks/exhaustive-deps). Recomputes only when the query, the
  // tag vocabulary or the search results change.
  const items: PaletteItem[] = useMemo(() => {
    // Detect `#tag` typing: suggest matching tag names; also surface them
    // when the input is empty as quick filters.
    const m = q.match(/(^|\s)#(\S*)$/);
    const tagQuery = m ? m[2].toLowerCase() : null;
    const tagSuggestions = tagQuery !== null
      ? vocab.filter(({ tag }) => tag.toLowerCase().includes(tagQuery)).slice(0, 6)
      : (q.trim() === '' ? vocab.slice(0, 5) : []);

    // Icon and run-callback map, keyed by CommandId — kept here because they
    // capture React context (navigate, toggleTheme, setPaletteOpen) and
    // contain JSX, which would make the commands module impure.
    const commandExtras: Record<string, { icon: React.ReactNode; run: () => void }> = {
      theme:    { icon: <Moon className="size-3.5" />,             run: () => { toggleTheme(); setPaletteOpen(false); } },
      'go-graph': { icon: <Network className="size-3.5" />,        run: () => { navigate('/graph'); setPaletteOpen(false); } },
      'go-chat':  { icon: <MessagesSquare className="size-3.5" />, run: () => { navigate('/chat'); setPaletteOpen(false); } },
      'go-dash':  { icon: <BarChart3 className="size-3.5" />,      run: () => { navigate('/dashboards'); setPaletteOpen(false); } },
      export:   { icon: <Download className="size-3.5" />,         run: () => { window.print(); setPaletteOpen(false); } },
    };

    const commands: PaletteItem[] = filterCommands(STATIC_COMMANDS, q).map((def) => ({
      id: def.id,
      group: 'Comandos' as const,
      title: def.title,
      kbd: def.kbd,
      ...commandExtras[def.id],
    }));

    return [
      ...tagSuggestions.map<PaletteItem>(({ tag, count }) => ({
        id: `tag-${tag}`,
        group: 'Tags',
        icon: <Hash className="size-3.5" />,
        title: `#${tag}`,
        subtitle: `${count} ${count === 1 ? 'norma' : 'normas'} con este tag`,
        run: () => { navigate(`/explorer?tags=${encodeURIComponent(tag)}`); setPaletteOpen(false); },
      })),
      ...(searchData?.hits ?? []).map<PaletteItem>((h) => ({
        id: h.id,
        group: h.kind === 'law' ? 'Leyes' : 'Artículos',
        icon: h.kind === 'law' ? <BookOpenText className="size-3.5" /> : <FileText className="size-3.5" />,
        title: h.title,
        subtitle: h.snippet ? (
          <HighlightedSnippet
            text={h.snippet}
            match={h.match}
            prefix={h.articleNumber ? `Art. ${h.articleNumber} — ` : undefined}
          />
        ) : (
          h.subtitle
        ),
        run: () => {
          const p = h.payload as { lawId?: string };
          if (p?.lawId) navigate(`/laws/${encodeURIComponent(p.lawId)}`);
          setPaletteOpen(false);
        },
      })),
      ...commands,
    ];
  }, [q, vocab, searchData, navigate, toggleTheme, setPaletteOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!paletteOpen) return;
      if (e.key === 'Escape') { setPaletteOpen(false); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
      if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, items, active, setPaletteOpen]);

  if (!paletteOpen) return null;

  // group items
  const groups: PaletteItem['group'][] = ['Tags', 'Leyes', 'Artículos', 'Comandos'];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/35 backdrop-blur-[2px] animate-in"
      onClick={() => setPaletteOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="air-glass-strong w-[580px] max-w-[92vw] overflow-hidden"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="size-4 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar leyes, artículos, #tag, comandos…"
            className="flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-muted"
          />
          <Kbd>esc</Kbd>
        </div>

        <div role="listbox" aria-label="Resultados" className="max-h-[420px] overflow-auto p-2 scrollbar-thin">
          {items.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-muted">Sin resultados para "{q}".</div>
          )}
          {groups.map((g) => {
            const rows = items.filter((i) => i.group === g);
            if (!rows.length) return null;
            return (
              <div key={g} className="mb-2">
                <div className="label-caps px-2.5 pt-1 pb-1">{g}</div>
                {rows.map((it) => {
                  const idx = items.indexOf(it);
                  return (
                    <button
                      key={it.id}
                      role="option"
                      aria-selected={active === idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => it.run()}
                      className={cn(
                        'flex w-full items-center gap-3 rounded px-2.5 py-2 text-left text-[13.5px] transition-colors',
                        active === idx ? 'bg-primary-soft text-indigo-700 dark:text-indigo-200' : 'text-fg hover:bg-surface-2',
                      )}
                    >
                      <span className={cn(
                        'inline-flex size-6 items-center justify-center rounded',
                        it.group === 'Tags' && 'bg-amber-soft text-amber-700 dark:text-amber-300',
                        it.group === 'Leyes' && 'bg-primary-soft text-indigo-700',
                        it.group === 'Artículos' && 'bg-amber-soft text-amber-700',
                        it.group === 'Comandos' && 'bg-[hsl(266_65%_92%/.6)] text-[hsl(266_50%_40%)] dark:bg-[hsl(266_30%_22%)] dark:text-[hsl(266_60%_80%)]',
                      )}>{it.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{it.title}</div>
                        {it.subtitle && <div className="truncate text-[12px] text-muted">{it.subtitle}</div>}
                      </div>
                      {it.kbd && <Kbd>{it.kbd}</Kbd>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3.5 border-t border-border px-4 py-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navegar</span>
          <span className="inline-flex items-center gap-1"><Kbd>↵</Kbd> abrir</span>
          <span className="ml-auto font-mono">{items.length} resultados</span>
        </div>
      </div>
    </div>
  );
}
