import { describe, expect, it } from 'vitest';

import { filterCommands, STATIC_COMMANDS } from './commands';
import type { CommandDef } from './commands';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cmd(over: Partial<CommandDef> & { id: CommandDef['id'] }): CommandDef {
  return { title: 'Untitled', ...over };
}

const registry: CommandDef[] = [
  cmd({ id: 'theme',    title: 'Cambiar tema'             }),
  cmd({ id: 'go-graph', title: 'Ir al grafo', kbd: 'g g' }),
  cmd({ id: 'go-chat',  title: 'Ir al chat',  kbd: 'g c' }),
  cmd({ id: 'go-dash',  title: 'Cuadros de mando'        }),
  cmd({ id: 'export',   title: 'Exportar página como PDF' }),
];

// ---------------------------------------------------------------------------
// filterCommands
// ---------------------------------------------------------------------------

describe('filterCommands', () => {
  it('returns all commands when query is empty', () => {
    expect(filterCommands(registry, '')).toHaveLength(registry.length);
  });

  it('treats a non-empty query literally — no trimming (parity with the original filter)', () => {
    // The original inline filter short-circuited only on the empty string; a
    // whitespace query is matched as-is, so it matches no title here.
    expect(filterCommands(registry, '   ')).toEqual([]);
  });

  it('matches case-insensitively', () => {
    const result = filterCommands(registry, 'TEMA');
    expect(result.map((c) => c.id)).toEqual(['theme']);
  });

  it('matches a partial substring', () => {
    // "grafo" is a substring of "Ir al grafo"
    const result = filterCommands(registry, 'grafo');
    expect(result.map((c) => c.id)).toEqual(['go-graph']);
  });

  it('returns multiple matches when query spans several titles', () => {
    // "ir" appears in "Ir al grafo" and "Ir al chat"
    const result = filterCommands(registry, 'ir');
    expect(result.map((c) => c.id)).toEqual(['go-graph', 'go-chat']);
  });

  it('returns empty array when nothing matches', () => {
    expect(filterCommands(registry, 'zzznomatch')).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const original = [...registry];
    filterCommands(registry, 'tema');
    expect(registry).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// STATIC_COMMANDS — shape invariants
// ---------------------------------------------------------------------------

describe('STATIC_COMMANDS', () => {
  it('contains exactly 5 commands', () => {
    expect(STATIC_COMMANDS).toHaveLength(5);
  });

  it('all ids are unique', () => {
    const ids = STATIC_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all entries have a non-empty title', () => {
    for (const c of STATIC_COMMANDS) {
      expect(c.title.trim().length).toBeGreaterThan(0);
    }
  });

  it('includes the five expected ids in order', () => {
    expect(STATIC_COMMANDS.map((c) => c.id)).toEqual([
      'theme', 'go-graph', 'go-chat', 'go-dash', 'export',
    ]);
  });
});
