import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Hash, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatDate, statusLabel } from '@/lib/utils';
import type { Law, UserTag } from '@/lib/types';

export interface LawHeaderProps {
  law: Law;
  /** Called when the user clicks a tag chip — typically navigates to /explorer?tags=… */
  onTagClick?: (tag: string) => void;
  /**
   * Real version count from `/laws/{id}/versions` (#592). `law.versiones`
   * is left at 0 by the law-detail endpoint (the count needs git log), so
   * the parent passes the loaded length; falls back to `law.versiones`.
   */
  versionsCount?: number;
  /**
   * Custom user tags on this law (#670) — freeform labels the user attaches
   * locally, distinct from the official BOE-derived `law.tags` above. The
   * "Mis tags" row only renders when both `onAddUserTag` and
   * `onRemoveUserTag` are supplied, so callers that don't wire user tags
   * (tests, previews) see the header unchanged.
   */
  userTags?: UserTag[];
  onAddUserTag?: (label: string) => void;
  onRemoveUserTag?: (tag: string) => void;
}

export function LawHeader({
  law,
  onTagClick,
  versionsCount,
  userTags,
  onAddUserTag,
  onRemoveUserTag,
}: LawHeaderProps) {
  const { t } = useTranslation();
  const tone =
    law.status === 'vigente' ? 'success' :
    law.status === 'derogada' ? 'danger' : 'amber';
  return (
    <header className="bg-bg pt-5 pb-0 px-8">
      <div className="mb-2 flex items-center gap-2">
        <Badge tone={tone}>{statusLabel(law.status)}</Badge>
        <span className="font-mono text-[12px] text-muted">{law.boe}</span>
        <span className="text-[12px] text-muted">·</span>
        <span className="text-[12px] text-muted">{law.rango}</span>
        {/* Deslop sprint #798 — Save/Share/Export removed: `onExport`/
            `onShare`/`onBookmark` were optional props LawDetailPage never
            passed, so these rendered as fully-affordanced dead buttons.
            Re-add once a real implementation lands. */}
      </div>
      <h1 className="text-3xl font-display font-semibold tracking-tight">{law.short}</h1>
      <p className="mt-1.5 max-w-3xl text-[13.5px] text-muted">{law.title}</p>

      <div className="mt-3.5 flex flex-wrap items-center gap-6 text-[13px]">
        <Stat label={t('lawHeader.stats.articles')} value={String(law.articulos)} />
        <Stat label={t('lawHeader.stats.versions')} value={String(versionsCount ?? law.versiones)} />
        <Stat label={t('lawHeader.stats.references')} value={String(law.referencias)} />
        <Stat label={t('lawHeader.stats.lastModified')} value={law.ultimaModificacion ? formatDate(law.ultimaModificacion) : '—'} />
        <span className="ml-auto inline-flex items-center gap-2">
          <span className="label-caps">{t('lawHeader.version')}</span>
          {/* Audit #409 — the button used to read "v1.3 (vigente)" for
              every law. We don't have a version-picker dropdown wired yet
              (would need ``useVersions(lawId)`` + a real popover).
              Deslop sprint #798: dropped the chevron + `<Button>` shell
              too — a chevron on an inert element still reads as a picker
              affordance that doesn't exist. A plain badge just states
              the real status. */}
          <Badge tone={tone}>{law.status}</Badge>
        </span>
      </div>

      {law.tags && law.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {law.tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTagClick?.(t)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-px font-mono text-[11px] text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-primary-soft dark:text-indigo-200 dark:hover:border-indigo-700"
            >
              <Hash className="size-3 opacity-70" />{t}
            </button>
          ))}
        </div>
      )}

      {onAddUserTag && onRemoveUserTag && (
        <UserTagsRow userTags={userTags ?? []} onAddUserTag={onAddUserTag} onRemoveUserTag={onRemoveUserTag} />
      )}
    </header>
  );
}

/**
 * "Mis tags" row (#670) — custom, freeform labels attached to a law
 * locally, kept visually distinct (amber) from the official BOE tags
 * above so the two vocabularies never blend.
 *
 * The "add tag" control reuses ChatPage's inline-rename interaction
 * (`editingId`/`commitRename` in `pages/ChatPage.tsx`): a trigger button
 * swaps for a focused text input, Enter commits, Escape/blur cancels.
 */
function UserTagsRow({
  userTags,
  onAddUserTag,
  onRemoveUserTag,
}: {
  userTags: UserTag[];
  onAddUserTag: (label: string) => void;
  onRemoveUserTag: (tag: string) => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const commit = () => {
    const trimmed = value.trim();
    setAdding(false);
    setValue('');
    if (trimmed) onAddUserTag(trimmed);
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {userTags.map((ut) => (
        <span
          key={ut.tag}
          className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-px font-mono text-[11px] text-amber-700 dark:text-amber-200"
        >
          {ut.label}
          <button
            type="button"
            onClick={() => onRemoveUserTag(ut.tag)}
            aria-label={t('lawHeader.removeUserTag', 'Quitar "{{label}}"', { label: ut.label })}
            className="rounded-full p-0.5 hover:bg-amber-500/30"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setAdding(false);
          }}
          placeholder={t('lawHeader.addUserTagPlaceholder', 'nueva etiqueta')}
          className="w-32 rounded-full border border-amber-500/60 bg-surface px-2 py-px font-mono text-[11px] outline-none focus:ring-2 focus:ring-amber-500/50"
        />
      ) : (
        <button
          type="button"
          onClick={() => { setValue(''); setAdding(true); }}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border-strong px-2 py-px font-mono text-[11px] text-muted transition-colors hover:border-amber-500/60 hover:text-amber-700 dark:hover:text-amber-200"
        >
          <Plus className="size-2.5" />
          {t('lawHeader.addUserTag', 'tag')}
        </button>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex flex-col">
      <span className="text-[10.5px] uppercase tracking-[0.04em] text-muted">{label}</span>
      <span className="font-mono text-[14px] font-semibold">{value}</span>
    </span>
  );
}
