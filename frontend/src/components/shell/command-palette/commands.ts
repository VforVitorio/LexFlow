/**
 * Static command registry and query filter for the CommandPalette.
 *
 * Extracted from `CommandPalette` to shrink that god component and make
 * command definitions unit-testable (#556).
 *
 * Deliberately free of React and closures: a `CommandDef` carries only
 * plain data (id, title, optional kbd hint). Icons and `run` callbacks are
 * wired up inside `CommandPalette` after filtering so this module stays
 * fully testable without a DOM.
 *
 * WHERE TO CHANGE IF X CHANGES: when a new Comando is added, append an
 * entry to `STATIC_COMMANDS`. The icon and `run` callback must be added in
 * the corresponding block inside `CommandPalette.tsx`.
 */

/** Identifier for each static command. Used as the React key and lookup. */
export type CommandId = 'theme' | 'go-graph' | 'go-chat' | 'go-dash' | 'export';

/** Plain-data descriptor for a static palette command (no React, no closures). */
export interface CommandDef {
  /** Stable identifier; doubles as the React list key. */
  id: CommandId;
  /** Display label shown in the palette row. */
  title: string;
  /** Optional keyboard shortcut hint displayed next to the row. */
  kbd?: string;
}

/**
 * All static commands available in the palette, in display order.
 *
 * Each entry is a plain-data record — icons and `run` callbacks are added
 * by `CommandPalette` after filtering.
 */
export const STATIC_COMMANDS: CommandDef[] = [
  { id: 'theme',    title: 'Cambiar tema',             kbd: '⌘ .' },
  { id: 'go-graph', title: 'Ir al grafo',              kbd: 'g g' },
  { id: 'go-chat',  title: 'Ir al chat',               kbd: 'g c' },
  { id: 'go-dash',  title: 'Cuadros de mando',         kbd: 'g d' },
  { id: 'export',   title: 'Exportar página como PDF'             },
];

/**
 * Filter `commands` by `query`, case-insensitively matching against `title`.
 *
 * Returns the full list unchanged when `query` is empty, mirroring the
 * original inline filter (``!q || title.includes(q)``) exactly — the raw
 * query is matched as-is, with no trimming, so behaviour is preserved.
 *
 * @param commands - Source registry to filter (typically `STATIC_COMMANDS`).
 * @param query    - Raw palette input value, may be empty.
 * @returns Subset of `commands` whose `title` contains `query` (case-insensitive).
 */
export function filterCommands(commands: CommandDef[], query: string): CommandDef[] {
  if (!query) return commands;
  const needle = query.toLowerCase();
  return commands.filter((c) => c.title.toLowerCase().includes(needle));
}
