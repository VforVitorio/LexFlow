import { Home, BookOpenText, Network, MessagesSquare, BarChart3 } from 'lucide-react';

/**
 * Primary navigation destinations — the single source of truth shared by
 * the desktop `LeftRail` and the mobile `BottomTabBar`.
 *
 * --- WHERE TO CHANGE IF NAVIGATION CHANGES ---
 * Adding/removing a top-level section means editing this array only; both
 * rails pick it up. Keep it at 5 entries: the mobile bottom-tab bar is
 * sized for exactly five tabs on a 375px-wide screen (iPhone SE).
 */
export interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** Two-key "go to" hotkey hint, e.g. "g h". */
  k: string;
}

export const NAV: NavItem[] = [
  { to: '/home', icon: Home, label: 'Inicio', k: 'g h' },
  { to: '/explorer', icon: BookOpenText, label: 'Explorador', k: 'g e' },
  { to: '/graph', icon: Network, label: 'Grafo', k: 'g g' },
  { to: '/chat', icon: MessagesSquare, label: 'Chat', k: 'g c' },
  { to: '/dashboards', icon: BarChart3, label: 'Cuadros', k: 'g d' },
];
