/**
 * Backend → SPA shape transformers.
 *
 * The backend wire is snake_case + Spanish-locale enum strings; the
 * SPA types are camelCase + readable Spanish labels. Every translation
 * happens here so resource modules can call `transformLaw(raw)` without
 * knowing the mapping rules. Shared by laws + articles + graph + diff +
 * search endpoints.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Backend enum values      → `RANK_MAP` / `STATUS_MAP` / `SCOPE_MAP`.
 * Article/section shape    → `transformArticle` / `sectionToHierarchy`.
 * Commit-message → kind    → `deriveVersionKind`.
 */

import type {
  BackendArticle,
  BackendDiffStats,
  BackendLawDetail,
  BackendLawDiff,
  BackendLawSummary,
  BackendLawVersion,
  BackendReference,
  BackendSection,
} from '../../api';
import type {
  Ambito,
  Article,
  ArticleDiff,
  ArticleRef,
  DiffResult,
  HierarchyNode,
  Law,
  LawDetail,
  LawStatus,
  LawVersion,
  ListLawsParams,
  RangoNormativo,
} from '../types';

// ─── Enum maps ───────────────────────────────────────────────────────────

export const RANK_MAP: Record<string, RangoNormativo> = {
  ley: 'Ley',
  ley_organica: 'Ley Orgánica',
  real_decreto: 'Real Decreto',
  real_decreto_ley: 'Real Decreto',
  real_decreto_legislativo: 'RD Legislativo',
  decreto_legislativo: 'RD Legislativo',
  orden: 'Otro',
  otro: 'Otro',
};

export const STATUS_MAP: Record<string, LawStatus> = {
  in_force: 'vigente',
  repealed: 'derogada',
  partially_repealed: 'modificada',
  pending: 'pendiente',
};

export const SCOPE_MAP: Record<string, Ambito> = {
  Estatal: 'Estatal',
  Autonómico: 'Autonómica',
  Local: 'Local',
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildShortName(raw: { identifier: string; title: string }): string {
  // Drop the leading "Ley Orgánica X/YYYY, de ..." or similar — pick the first
  // 5-6 meaningful tokens after the rank prefix, or fall back to the BOE id.
  const trimmed = raw.title.replace(/^(Ley(\s+Orgánica)?|Real\s+Decreto(\s+Legislativo)?)[^,]*,?\s*(de\s+)?/i, '');
  const head = trimmed.split(/[,.]/, 1)[0].trim();
  if (head.length === 0) return raw.identifier;
  return head.length > 60 ? `${head.slice(0, 57)}…` : head;
}

function levelToKind(level: number): HierarchyNode['kind'] {
  switch (level) {
    case 2:
      return 'titulo';
    case 3:
      return 'capitulo';
    case 4:
      return 'seccion';
    case 5:
      return 'articulo';
    default:
      return 'disposicion';
  }
}

function sectionToHierarchy(section: BackendSection, path: string): HierarchyNode {
  const id = `${path}::${section.level}-${section.heading}`;
  const children: HierarchyNode[] = [
    ...(section.subsections ?? []).map((s, i) => sectionToHierarchy(s, `${id}::sub-${i}`)),
    ...(section.articles ?? []).map((a) => ({
      id: `${id}::art-${a.number}`,
      kind: 'articulo' as const,
      label: `Art. ${a.number}`,
      heading: a.title ?? undefined,
    })),
  ];
  return {
    id,
    kind: levelToKind(section.level),
    label: section.heading,
    heading: section.heading,
    children: children.length ? children : undefined,
  };
}

// ─── Public transformers ─────────────────────────────────────────────────

export function transformLaw(raw: BackendLawSummary): Law {
  return {
    id: raw.identifier,
    boe: raw.identifier,
    title: raw.title,
    short: buildShortName(raw),
    status: STATUS_MAP[raw.status] ?? 'pendiente',
    rango: RANK_MAP[raw.rank] ?? 'Otro',
    publicada: raw.publication_date ?? '',
    ambito: SCOPE_MAP[raw.scope] ?? 'Estatal',
    articulos: raw.article_count,
    // The list endpoint does not surface these — fill via the detail endpoint
    // when the user opens a law. Counts are advisory in the Explorer header.
    referencias: 0,
    versiones: 0,
  };
}

export function transformLawDetail(raw: BackendLawDetail): LawDetail {
  const m = raw.metadata;
  const hierarchy = (raw.sections ?? []).map((s, i) => sectionToHierarchy(s, `root-${i}`));
  return {
    id: m.identifier,
    boe: m.identifier,
    title: m.title,
    short: buildShortName(m),
    status: STATUS_MAP[m.status] ?? 'pendiente',
    rango: RANK_MAP[m.rank] ?? 'Otro',
    publicada: m.publication_date ?? '',
    ambito: SCOPE_MAP[m.scope] ?? 'Estatal',
    articulos: raw.article_count,
    referencias: (raw.references ?? []).length,
    versiones: 0,
    hierarchy,
  };
}

export function transformReference(ref: BackendReference): ArticleRef {
  return {
    label: ref.target_text,
    target: ref.target_id ? { lawId: ref.target_id } : undefined,
    kind: ref.target_id ? 'law' : undefined,
  };
}

export function transformArticle(lawId: string, raw: BackendArticle): Article {
  // The backend returns articles as a single text blob. We render it as one
  // unmarked clause for now — proper paragraph + (a) (b) (c) splitting and
  // inline citation handles are tracked separately (see follow-up issue).
  const refs = (raw.references ?? []).map(transformReference);
  return {
    id: `${lawId}::${raw.number}`,
    lawId,
    num: raw.number,
    titulo: raw.title ?? '',
    body: [{ marker: null, text: raw.text, citations: refs }],
    refs,
  };
}

// ─── Version + diff transformers ─────────────────────────────────────────

/** Heuristic for surfacing a useful tag + kind from a git commit message.
 * legalize-es commits look like "feat(...): Ley XX/YYYY, de ... (norma=...)".
 */
function deriveVersionKind(message: string): LawVersion['kind'] {
  const m = message.toLowerCase();
  if (/derog|repeal/.test(m)) return 'repeal';
  if (/consolid/.test(m)) return 'consolidate';
  // CodeQL alert #1 (#252 hardening): the previous pattern
  // `^feat\(publi|public` parses as `^feat\(publi` OR `public` — the
  // anchor only covers the first branch. We anchor both at a word
  // boundary so intent (catch publish/public/publica…) is preserved
  // without the misleading-precedence trap.
  if (/\b(publish|public)/.test(m)) return 'publish';
  return 'amend';
}

export function transformVersion(raw: BackendLawVersion): LawVersion {
  const subject = raw.message.split('\n', 1)[0].trim();
  const affected = raw.articulos_afectados ?? [];
  return {
    tag: raw.commit_hash.slice(0, 7),
    date: raw.date,
    label: raw.disposicion ?? raw.norma ?? subject.slice(0, 80),
    kind: deriveVersionKind(raw.message),
    changedArticles: affected.length ? affected : undefined,
  };
}

function buildVersionStub(commit: string, date: string | null): LawVersion {
  // When the backend gives us only the commit hash + date for the endpoints
  // of a diff, synthesise a minimal LawVersion so the DiffViewer can render
  // its left/right metadata.
  return {
    tag: commit.slice(0, 7),
    date: date ?? '',
    label: commit.slice(0, 7),
    kind: 'amend',
  };
}

function parseUnifiedDiffLines(text: string): ArticleDiff {
  // The backend returns a single unified diff for the whole file. We surface
  // it as one synthetic article so the DiffViewer can render it; a future
  // pass will explode it into per-article diffs (see follow-up issue).
  const lines = text.split('\n');
  const left: { t: 'eq' | 'add' | 'del'; s: string }[] = [];
  const right: { t: 'eq' | 'add' | 'del'; s: string }[] = [];
  for (const raw of lines) {
    if (raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('@@') || raw.startsWith('diff ')) continue;
    if (raw.startsWith('+')) {
      right.push({ t: 'add', s: raw.slice(1) });
    } else if (raw.startsWith('-')) {
      left.push({ t: 'del', s: raw.slice(1) });
    } else {
      const s = raw.startsWith(' ') ? raw.slice(1) : raw;
      left.push({ t: 'eq', s });
      right.push({ t: 'eq', s });
    }
  }
  return {
    num: 'todo',
    titulo: 'Diff completo',
    left: { tag: '', date: '', lines: left },
    right: { tag: '', date: '', lines: right },
    totals: {
      added: right.filter((l) => l.t === 'add').length,
      removed: left.filter((l) => l.t === 'del').length,
    },
  };
}

export function transformDiff(raw: BackendLawDiff): DiffResult {
  const article = parseUnifiedDiffLines(raw.diff_text);
  const stats: BackendDiffStats = raw.stats;
  return {
    lawId: raw.law_id,
    from: buildVersionStub(raw.from_commit, raw.from_date ?? null),
    to: buildVersionStub(raw.to_commit, raw.to_date ?? null),
    articles: [article],
    totals: {
      added: stats.additions,
      removed: stats.deletions,
      modified: (stats.changed_articles ?? []).length,
    },
  };
}

// ─── Param mapping for laws.list ─────────────────────────────────────────

export function listLawsQuery(params: ListLawsParams): Record<string, unknown> {
  // The backend list endpoint currently accepts single-value filters
  // (rank, status, scope, jurisdiction) plus pagination. Multi-select on the
  // frontend collapses to the first value until the backend supports IN-lists.
  return {
    page: params.cursor ? Number(params.cursor) : 1,
    page_size: params.limit ?? 20,
    rank: params.rango?.[0]
      ? Object.entries(RANK_MAP).find(([, v]) => v === params.rango?.[0])?.[0]
      : undefined,
    status: params.status?.[0]
      ? Object.entries(STATUS_MAP).find(([, v]) => v === params.status?.[0])?.[0]
      : undefined,
    scope: params.ambito?.[0]
      ? Object.entries(SCOPE_MAP).find(([, v]) => v === params.ambito?.[0])?.[0]
      : undefined,
  };
}
