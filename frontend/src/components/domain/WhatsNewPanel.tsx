/**
 * WhatsNewPanel — shown inside SplashGate during warm-up (#228).
 *
 * Loads in parallel with the warm-up progress bar. Reads the last-seen
 * corpus commit from localStorage and fetches the diff. On first launch
 * (no commit stored) or when nothing changed, renders nothing so the
 * splash stays clean.
 *
 * Stores the new commit in localStorage on mount so the next launch
 * shows only laws that changed after this session.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Backend shape → WhatsNewStatus in lib/types.ts + GET /api/v1/system/whats-new
 */

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useWhatsNew } from '../../lib/queries';
import type { WhatsNewLaw } from '../../lib/types';

const LS_KEY = 'lexflow.last-corpus-commit';

function loadLastCommit(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

function saveCommit(commit: string | null): void {
  try {
    if (commit) localStorage.setItem(LS_KEY, commit);
  } catch {
    /* storage unavailable */
  }
}

export function WhatsNewPanel() {
  const { t } = useTranslation();
  const since = loadLastCommit();
  const { data } = useWhatsNew(since);

  useEffect(() => {
    if (data?.toCommit) saveCommit(data.toCommit);
  }, [data?.toCommit]);

  const total = (data?.added.length ?? 0) + (data?.modified.length ?? 0) + (data?.removed.length ?? 0);
  if (!data || total === 0) return null;

  return (
    <div className="w-72 rounded-lg border border-border bg-card p-4 text-sm text-card-foreground shadow-sm">
      <p className="mb-2 font-medium text-foreground">{t('whatsNew.title')}</p>
      <LawList label={t('whatsNew.added')} laws={data.added} />
      <LawList label={t('whatsNew.modified')} laws={data.modified} />
      {data.removed.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('whatsNew.removed', { count: data.removed.length })}
        </p>
      )}
    </div>
  );
}

function LawList({ label, laws }: { label: string; laws: WhatsNewLaw[] }) {
  const { t } = useTranslation();
  if (laws.length === 0) return null;
  const visible = laws.slice(0, 4);
  const rest = laws.length - visible.length;
  return (
    <div className="mt-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <ul className="mt-0.5 space-y-0.5">
        {visible.map((l) => (
          <li key={l.lawId} className="truncate text-xs text-foreground" title={l.title ?? l.lawId}>
            {l.title ?? l.lawId}
          </li>
        ))}
        {rest > 0 && (
          <li className="text-xs text-muted-foreground">{t('whatsNew.andMore', { n: rest })}</li>
        )}
      </ul>
    </div>
  );
}
