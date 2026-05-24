/**
 * Landing-native preview that mirrors the SPA's ExplorerPage.
 *
 * Two columns (filter rail + laws table). The active tag chip is
 * driven by a parent prop so ApiFeature can auto-rotate through tags
 * and watch the result table reshuffle.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * SPA reference: frontend/src/pages/ExplorerPage.tsx
 * Styles:        landing/src/landing.css   .lf-prev-search-*
 */

import type { Lang } from '@/i18n';
import { PreviewChrome } from './PreviewChrome';

const TITLE: Record<Lang, string> = { es: 'Explorador · LexFlow', en: 'Explorer · LexFlow' };

interface Law {
  id: string;
  title: string;
  status: 'vigente' | 'modificada' | 'derogada';
  rango: string;
  tags: string[];
  refs: number;
  date: string;
}

const LAWS_ES: Law[] = [
  { id: 'LOPDGDD',  title: 'Ley Orgánica de Protección de Datos y Garantía de Derechos Digitales', status: 'vigente',    rango: 'Ley Orgánica',         tags: ['datos', 'digital'],     refs: 218, date: '2018-12-05' },
  { id: 'ET',       title: 'Real Decreto Legislativo del Estatuto de los Trabajadores',           status: 'modificada', rango: 'RD Legislativo',       tags: ['laboral'],              refs: 412, date: '2015-10-23' },
  { id: 'LRJSP',    title: 'Ley de Régimen Jurídico del Sector Público',                          status: 'vigente',    rango: 'Ley',                  tags: ['admin'],                refs: 156, date: '2015-10-01' },
  { id: 'LGT',      title: 'Ley General Tributaria',                                              status: 'modificada', rango: 'Ley',                  tags: ['fiscal', 'tributario'], refs: 287, date: '2003-12-17' },
  { id: 'CE-1978',  title: 'Constitución Española',                                               status: 'vigente',    rango: 'Norma constitucional', tags: ['constitucional'],       refs: 521, date: '1978-12-29' },
  { id: 'LECrim',   title: 'Ley de Enjuiciamiento Criminal',                                      status: 'modificada', rango: 'Ley',                  tags: ['penal', 'proceso'],     refs: 198, date: '1882-09-14' },
];
const LAWS_EN: Law[] = [
  { id: 'LOPDGDD', title: 'Organic Law on Data Protection and Guarantee of Digital Rights',  status: 'vigente',    rango: 'Organic Law',          tags: ['data', 'digital'],     refs: 218, date: '2018-12-05' },
  { id: 'ET',      title: "Royal Legislative Decree of the Workers' Statute",                status: 'modificada', rango: 'RD Legislativo',       tags: ['labour'],              refs: 412, date: '2015-10-23' },
  { id: 'LRJSP',   title: 'Law on Legal Regime of the Public Sector',                        status: 'vigente',    rango: 'Law',                  tags: ['admin'],               refs: 156, date: '2015-10-01' },
  { id: 'LGT',     title: 'General Tax Law',                                                 status: 'modificada', rango: 'Law',                  tags: ['tax'],                 refs: 287, date: '2003-12-17' },
  { id: 'CE-1978', title: 'Spanish Constitution',                                            status: 'vigente',    rango: 'Constitutional',       tags: ['constitutional'],      refs: 521, date: '1978-12-29' },
  { id: 'LECrim',  title: 'Criminal Procedure Law',                                          status: 'modificada', rango: 'Law',                  tags: ['criminal', 'process'], refs: 198, date: '1882-09-14' },
];

const COPY = {
  es: { filters: 'Filtros', status: 'Estado', vigente: 'Vigente', modificada: 'Modificada', derogada: 'Derogada', rango: 'Rango', refs: 'refs', placeholder: 'Buscar #tag o título…' },
  en: { filters: 'Filters', status: 'Status', vigente: 'Active',  modificada: 'Amended',    derogada: 'Repealed', rango: 'Rank',  refs: 'refs', placeholder: 'Search #tag or title…' },
} as const;

const STATUS_LABEL: Record<Law['status'], { es: string; en: string; cls: string }> = {
  vigente:    { es: 'Vigente',    en: 'Active',   cls: 'success' },
  modificada: { es: 'Modificada', en: 'Amended',  cls: 'warn' },
  derogada:   { es: 'Derogada',   en: 'Repealed', cls: 'muted' },
};

interface Props {
  lang: Lang;
  /** Active tag from the parent's auto-rotating chip list. Filters the law table; `null` shows all. */
  activeTag?: string | null;
}

export function SearchPreview({ lang, activeTag }: Props) {
  const t = COPY[lang] ?? COPY.en;
  const laws = (lang === 'es' ? LAWS_ES : LAWS_EN);
  const filtered = activeTag ? laws.filter((l) => l.tags.includes(activeTag)) : laws;
  return (
    <div className="lf-prev" aria-hidden="true">
      <PreviewChrome title={TITLE[lang] ?? TITLE.en} />
      <div className="lf-prev-body lf-prev-search">
      <aside className="lf-prev-search-rail">
        <div className="label-caps lf-prev-search-rail-label">{t.filters}</div>
        <div className="lf-prev-search-rail-section">
          <div className="lf-prev-search-rail-group">{t.status}</div>
          <label className="lf-prev-search-rail-check"><span className="lf-prev-check on" /> {t.vigente}</label>
          <label className="lf-prev-search-rail-check"><span className="lf-prev-check on" /> {t.modificada}</label>
          <label className="lf-prev-search-rail-check"><span className="lf-prev-check" /> {t.derogada}</label>
        </div>
        <div className="lf-prev-search-rail-section">
          <div className="lf-prev-search-rail-group">{t.rango}</div>
          <label className="lf-prev-search-rail-check"><span className="lf-prev-check on" /> Ley Orgánica</label>
          <label className="lf-prev-search-rail-check"><span className="lf-prev-check on" /> Ley</label>
          <label className="lf-prev-search-rail-check"><span className="lf-prev-check" /> Real Decreto</label>
        </div>
      </aside>
      <div className="lf-prev-search-main">
        <div className="lf-prev-search-bar">
          <span className="lf-prev-search-bar-icon">⌕</span>
          <span className="lf-prev-search-bar-text">
            {activeTag ? `#${activeTag}` : t.placeholder}
          </span>
        </div>
        <ul className="lf-prev-search-list">
          {filtered.slice(0, 4).map((law) => {
            const sl = STATUS_LABEL[law.status];
            return (
              <li key={law.id} className="lf-prev-search-row">
                <span className="lf-prev-search-row-id">{law.id}</span>
                <div className="lf-prev-search-row-body">
                  <div className="lf-prev-search-row-title">{law.title}</div>
                  <div className="lf-prev-search-row-meta">
                    <span className={`lf-prev-badge lf-prev-badge-${sl.cls}`}>{lang === 'es' ? sl.es : sl.en}</span>
                    <span className="lf-prev-search-row-rango">{law.rango}</span>
                    <span className="lf-prev-search-row-refs">{law.refs} {t.refs}</span>
                    {law.tags.map((tg) => (
                      <span key={tg} className={`lf-prev-tag${tg === activeTag ? ' active' : ''}`}>#{tg}</span>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="lf-prev-search-empty">
              {lang === 'es' ? 'Sin resultados para este filtro.' : 'No results for this filter.'}
            </li>
          )}
        </ul>
      </div>
      </div>
    </div>
  );
}
