import { NavLink } from 'react-router-dom';
import { Settings, PanelLeft, PanelRightOpen, FileEdit } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/BrandMark';
import { Kbd } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useUi, LEFT_RAIL_MIN, LEFT_RAIL_MAX } from '@/lib/store';
import { useLawsList } from '@/lib/queries';
import { NAV } from './nav-items';
import { RailResizer } from './RailResizer';
import { useEdgeResize } from './use-edge-resize';

export function LeftRail() {
  const expanded = useUi((s) => s.leftExpanded);
  const leftWidth = useUi((s) => s.leftWidth);
  const setLeftWidth = useUi((s) => s.setLeftWidth);
  const toggle = useUi((s) => s.toggleLeft);
  const { t } = useTranslation();
  const { data: laws } = useLawsList({}, { staleTime: 60_000 });
  const recent = laws?.items.slice(0, 3) ?? [];
  const { dragging, startDrag } = useEdgeResize('left', setLeftWidth);

  return (
    <nav
      aria-label={t('nav.main')}
      data-tour-id="left-rail"
      style={expanded ? { width: leftWidth } : undefined}
      className={cn(
        // Hidden on mobile — the BottomTabBar takes over below `md`.
        'relative hidden shrink-0 flex-col border-r border-border bg-surface overflow-hidden md:flex',
        // Animate width on collapse/expand, but never while dragging — the
        // transition would lag a frame behind the pointer.
        !dragging && 'transition-[width] duration-200',
        !expanded && 'w-[60px]',
      )}
    >
      {/* Brand. When collapsed, the logo doubles as a big, obvious
          "expand" target so the rail can always be reopened even if the
          small toggle at the bottom is missed (#565). */}
      <div className={cn('flex h-12 items-center gap-2.5 border-b border-border', expanded ? 'px-3.5' : 'justify-center')}>
        {expanded ? (
          <>
            <BrandMark />
            <span className="font-display text-[15.5px] font-semibold tracking-tight">LexFlow</span>
          </>
        ) : (
          <button
            type="button"
            onClick={toggle}
            title={t('nav.expand')}
            aria-label={t('nav.expand')}
            className="grid size-9 place-items-center rounded-lg hover:bg-surface-2"
          >
            <BrandMark />
          </button>
        )}
      </div>

      {/* Nav items */}
      <div className="flex flex-col gap-0.5 p-2">
        {NAV.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            title={!expanded ? t(it.labelKey) : undefined}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors',
                isActive
                  ? 'bg-primary-soft text-indigo-700 dark:text-indigo-200 font-semibold'
                  : 'text-fg hover:bg-surface-2',
                !expanded && 'justify-center px-0 py-2.5',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-indigo-500" />}
                <it.icon className={cn('size-[17px]', isActive ? 'stroke-[2]' : 'stroke-[1.75]')} />
                {expanded && <span className="flex-1 text-left">{t(it.labelKey)}</span>}
                {expanded && <Kbd>{it.k}</Kbd>}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Recent */}
      {expanded && recent.length > 0 && (
        <div className="mt-auto border-t border-border px-3.5 py-3">
          <div className="label-caps mb-1.5">{t('nav.recent')}</div>
          <div className="flex flex-col gap-1">
            {recent.map((l) => (
              <NavLink
                key={l.id}
                to={`/laws/${l.id}`}
                className="flex items-center gap-2 truncate rounded px-1.5 py-1 text-[12.5px] hover:bg-surface-2"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-indigo-500" />
                <span className="truncate">{l.short}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* Bottom: editor + settings + collapse */}
      <div className={cn('border-t border-border p-2 flex flex-col gap-0.5', !expanded && 'items-center')}>
        {/* Editor — secondary destination; not in the main NAV array so it
            doesn't appear in the mobile BottomTabBar (which is sized for 5). */}
        <NavLink
          to="/editor"
          title={!expanded ? t('nav.editor') : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors',
              isActive ? 'text-fg bg-surface-2' : 'text-muted hover:bg-surface-2',
              !expanded && 'justify-center px-0 py-2.5',
            )
          }
        >
          <FileEdit className="size-[17px]" />
          {expanded && <span className="flex-1 text-left">{t('nav.editor')}</span>}
          {expanded && <Kbd>g n</Kbd>}
        </NavLink>
        <NavLink
          to="/settings"
          title={!expanded ? t('nav.settings') : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors',
              isActive ? 'text-fg bg-surface-2' : 'text-muted hover:bg-surface-2',
              !expanded && 'justify-center px-0 py-2.5',
            )
          }
        >
          <Settings className="size-[17px]" />
          {expanded && <span className="flex-1 text-left">{t('nav.settings')}</span>}
          {expanded && <Kbd>g s</Kbd>}
        </NavLink>
        <button
          onClick={toggle}
          title={expanded ? t('nav.collapse') : t('nav.expand')}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-muted hover:bg-surface-2',
            !expanded && 'justify-center px-0 py-2.5',
          )}
        >
          {expanded ? <PanelLeft className="size-4" /> : <PanelRightOpen className="size-4" />}
          {expanded && <span className="flex-1 text-left">{t('nav.collapse')}</span>}
          {expanded && <Kbd>⌘ \\</Kbd>}
        </button>
      </div>

      {/* Drag-to-resize separator on the right edge (#594). Only when the
          rail is expanded — the collapsed rail is a fixed icon strip. */}
      {expanded && (
        <RailResizer
          edge="left"
          width={leftWidth}
          setWidth={setLeftWidth}
          min={LEFT_RAIL_MIN}
          max={LEFT_RAIL_MAX}
          label={t('nav.resize')}
          dragging={dragging}
          startDrag={startDrag}
        />
      )}
    </nav>
  );
}
