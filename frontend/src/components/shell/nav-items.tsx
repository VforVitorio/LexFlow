import { Home, BookOpenText, Network, MessagesSquare, BarChart3 } from 'lucide-react';

/**
 * Primary navigation destinations — the single source of truth shared by
 * the desktop `LeftRail` and the mobile `BottomTabBar`.
 *
 * --- WHERE TO CHANGE IF NAVIGATION CHANGES ---
 * Adding/removing a top-level section means editing this array only; both
 * rails pick it up. Keep it at 5 entries: the mobile bottom-tab bar is
 * sized for exactly five tabs on a 375px-wide screen (iPhone SE).
 *
 * `labelKey` is the i18n key under the `nav` namespace
 * (`frontend/src/i18n/locales/<lang>/common.json`). Consumers resolve it
 * with `t(item.labelKey)` so the rail re-renders when the user switches
 * language from Settings.
 */
export interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  /** i18n key under the `nav` namespace (e.g. ``"nav.home"``). */
  labelKey: string;
  /** Two-key "go to" hotkey hint, e.g. "g h". */
  k: string;
}

export const NAV: NavItem[] = [
  { to: '/home', icon: Home, labelKey: 'nav.home', k: 'g h' },
  { to: '/explorer', icon: BookOpenText, labelKey: 'nav.explorer', k: 'g e' },
  { to: '/graph', icon: Network, labelKey: 'nav.graph', k: 'g g' },
  { to: '/chat', icon: MessagesSquare, labelKey: 'nav.chat', k: 'g c' },
  { to: '/dashboards', icon: BarChart3, labelKey: 'nav.dashboards', k: 'g d' },
];
