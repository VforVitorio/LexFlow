import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Input } from '@/components/ui';
import { Search } from 'lucide-react';
import { useSearch } from '@/lib/queries';
import { groupBy } from '@/lib/utils';
import { EmptyState } from '@/components/domain/EmptyState';

export function SearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const navigate = useNavigate();
  const { data, isLoading } = useSearch(q);

  const grouped = groupBy(data?.hits ?? [], (h) => h.kind);

  return (
    <div className="mx-auto h-full max-w-3xl overflow-auto px-8 py-7 scrollbar-thin">
      <Input
        icon={<Search className="size-3.5" />}
        defaultValue={q}
        placeholder="Buscar leyes, artículos, conversaciones…"
        onChange={(e) => setParams({ q: e.target.value })}
        className="w-full"
      />
      <p className="mt-3 text-[12.5px] text-muted">
        {isLoading ? 'Buscando…' : `${data?.total ?? 0} resultados para "${q}"`}
      </p>
      {!isLoading && data && data.total === 0 && (
        <EmptyState
          className="mt-8"
          title="Sin resultados"
          description="Prueba a reducir el número de palabras o eliminar acentos."
        />
      )}
      {Object.entries(grouped).map(([kind, hits]) => (
        <section key={kind} className="mt-6">
          <div className="label-caps mb-2 flex items-baseline justify-between">
            <span>{kind === 'law' ? 'Leyes' : kind === 'article' ? 'Artículos' : kind}</span>
            <button className="text-[12px] text-indigo-600 dark:text-indigo-300">Ver todo →</button>
          </div>
          <div className="flex flex-col gap-1.5">
            {hits.map((h) => (
              <button
                key={h.id}
                onClick={() => {
                  const p = h.payload as { lawId?: string } | undefined;
                  if (p?.lawId) navigate(`/laws/${p.lawId}`);
                }}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-left hover:bg-surface-2"
              >
                <Badge tone={h.kind === 'law' ? 'primary' : 'amber'}>{h.kind}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{h.title}</div>
                  {h.subtitle && <div className="truncate text-[12.5px] text-muted">{h.subtitle}</div>}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
