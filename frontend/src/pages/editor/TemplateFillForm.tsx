/**
 * TemplateFillForm — the variable-mapping step of the template system (#600).
 *
 * Rendered inside `TemplatesDialog` once a template with `{{variables}}` is
 * chosen. Splits variables into:
 * - built-in `law.*` vars → filled from a corpus law pick (reuses the same
 *   universal search as the citation picker, #599), and
 * - free-text vars → one input each.
 *
 * On "Aplicar" it hands the merged values up; the dialog substitutes them and
 * inserts the draft. Unknown/empty vars are intentionally left as placeholders.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, BookOpenText, Search, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useLaw, useSearch } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { DocumentTemplate } from '@/lib/template-store';
import { extractVariables, lawVariableValues } from './template-utils';

interface TemplateFillFormProps {
  template: DocumentTemplate;
  onApply: (values: Record<string, string>) => void;
  onBack: () => void;
}

export function TemplateFillForm({ template, onApply, onBack }: TemplateFillFormProps) {
  const variables = useMemo(() => extractVariables(template.content), [template]);
  const lawVars = variables.filter((v) => v.startsWith('law.'));
  const customVars = variables.filter((v) => !v.startsWith('law.'));

  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [lawQuery, setLawQuery] = useState('');
  const [lawId, setLawId] = useState<string | null>(null);

  const { data: searchData } = useSearch(lawQuery);
  const lawHits = (searchData?.hits ?? []).filter((h) => h.kind === 'law' && typeof h.payload?.lawId === 'string');
  const { data: law } = useLaw(lawId ?? undefined);

  const lawValues = law ? lawVariableValues(law) : {};

  const apply = () => onApply({ ...lawValues, ...customValues });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon-sm" aria-label="Volver a la lista" title="Volver" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold">{template.name}</div>
          <div className="text-[11px] text-muted">Rellena las variables para generar el borrador</div>
        </div>
      </div>

      <div className="max-h-[60vh] space-y-5 overflow-auto p-4 scrollbar-thin">
        {/* Built-in corpus variables: pick one law to fill them all. */}
        {lawVars.length > 0 && (
          <section className="space-y-2">
            <div className="label-caps">Datos de la ley</div>
            {lawId && law ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                <span className="inline-flex items-center gap-2 truncate text-[13px]">
                  <BookOpenText className="size-3.5 shrink-0 text-indigo-600" />
                  <span className="truncate font-medium">{law.short || law.title}</span>
                  <span className="truncate text-muted">{law.id}</span>
                </span>
                <Button variant="ghost" size="icon-sm" aria-label="Quitar ley" title="Quitar" onClick={() => setLawId(null)}>
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-border">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <Search className="size-3.5 text-muted" />
                  <input
                    value={lawQuery}
                    onChange={(e) => setLawQuery(e.target.value)}
                    placeholder="Buscar la ley con la que rellenar…"
                    className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted"
                  />
                </div>
                <div className="max-h-44 overflow-auto p-1 scrollbar-thin">
                  {lawHits.length === 0 ? (
                    <div className="px-3 py-3 text-center text-[12px] text-muted">
                      {lawQuery.trim().length < 2 ? 'Escribe al menos 2 caracteres.' : 'Sin leyes para esta búsqueda.'}
                    </div>
                  ) : (
                    lawHits.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setLawId(h.payload!.lawId as string)}
                        className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px] text-fg transition-colors hover:bg-surface-2"
                      >
                        <BookOpenText className="size-3.5 shrink-0 text-indigo-600" />
                        <span className="truncate">{h.title}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
            <ul className="flex flex-wrap gap-1.5">
              {lawVars.map((v) => (
                <li
                  key={v}
                  className={cn(
                    'rounded px-1.5 py-0.5 font-mono text-[11px]',
                    lawId && law ? 'bg-primary-soft text-indigo-700 dark:text-indigo-200' : 'bg-surface-2 text-muted',
                  )}
                >
                  {`{{${v}}}`}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Free-text variables. */}
        {customVars.length > 0 && (
          <section className="space-y-2">
            <div className="label-caps">Variables</div>
            {customVars.map((v) => (
              <label key={v} className="block space-y-1">
                <span className="font-mono text-[12px] text-muted">{`{{${v}}}`}</span>
                <input
                  value={customValues[v] ?? ''}
                  onChange={(e) => setCustomValues((prev) => ({ ...prev, [v]: e.target.value }))}
                  placeholder={`Valor para ${v}`}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-[13.5px] outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </label>
            ))}
          </section>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Cancelar
        </Button>
        <Button variant="primary" size="sm" onClick={apply}>
          Aplicar plantilla
        </Button>
      </div>
    </div>
  );
}
