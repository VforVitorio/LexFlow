/**
 * Time-of-day + name-aware greeting for HomePage (#249 / #115 / #248).
 *
 * Started as a single deterministic greeting per time bucket and now
 * picks from a pool of ~15 entries on each app entry, with a
 * no-repeat-twice guard against the previously-shown id. The pool
 * mixes three categories so two entries in a row don't read alike:
 *
 *   - **time**      → "Buenos días" / "Buenas tardes" / "Buenas noches".
 *   - **free-tone** → "¿Qué buscamos hoy?", "Tu corpus está al día".
 *   - **playful**   → name-aware lines like "Hola de nuevo, {name}".
 *
 * The plug-in seam stays at `pickGreeting`; the rest of the SPA never
 * touches `GREETING_POOL` directly — call sites just render the
 * returned `Greeting.text`.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Add a phrase           → append a `GreetingEntry` to GREETING_POOL.
 * * Change weighting        → wrap the uniform `pick` below in a weighted variant.
 * * New name source         → swap `readStoredUserName`.
 * * New time bucket         → extend `bucketFor` + `BUCKET_GREETING`.
 */

/** localStorage key for the user-typed display name (set by #229 step 2 / #115). */
export const USER_NAME_STORAGE_KEY = 'lexflow.user-name';

/** localStorage key for the id of the last shown greeting (#248 no-repeat guard). */
export const LAST_GREETING_STORAGE_KEY = 'lexflow.last-greeting-id';

type TimeBucket = 'morning' | 'afternoon' | 'evening';

const BUCKET_GREETING: Record<TimeBucket, string> = {
  morning: 'Buenos días',
  afternoon: 'Buenas tardes',
  evening: 'Buenas noches',
};

function bucketFor(hour: number): TimeBucket {
  if (hour < 12) return 'morning';
  if (hour < 19) return 'afternoon';
  return 'evening';
}

function readStoredUserName(): string | null {
  try {
    const raw = localStorage.getItem(USER_NAME_STORAGE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length === 0 ? null : trimmed;
  } catch {
    return null;
  }
}

function readLastGreetingId(): string | null {
  try {
    return localStorage.getItem(LAST_GREETING_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveLastGreetingId(id: string): void {
  try {
    localStorage.setItem(LAST_GREETING_STORAGE_KEY, id);
  } catch {
    /* storage unavailable — fine, we just lose the no-repeat guard. */
  }
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

export type GreetingCategory = 'time' | 'free' | 'playful';

interface GreetingContext {
  bucket: TimeBucket;
  name: string | null;
}

/**
 * A pool entry. `render` returns the final string, or `null` when the
 * entry doesn't apply in the current context (e.g. a name-aware entry
 * when no name is stored). `null`-returning entries are filtered out
 * before the random pick so they never surface as blanks.
 */
interface GreetingEntry {
  id: string;
  category: GreetingCategory;
  render: (ctx: GreetingContext) => string | null;
}

const GREETING_POOL: GreetingEntry[] = [
  // ── time-aware (always available) ────────────────────────────────────
  {
    id: 'time-plain',
    category: 'time',
    render: ({ bucket, name }) => (name ? `${BUCKET_GREETING[bucket]}, ${name}` : BUCKET_GREETING[bucket]),
  },
  {
    id: 'time-corpus-update',
    category: 'time',
    render: ({ bucket }) => `${BUCKET_GREETING[bucket]} — el corpus te espera`,
  },
  // ── free-tone (no name / no bucket dependency) ──────────────────────
  {
    id: 'free-question',
    category: 'free',
    render: () => '¿Qué buscamos hoy?',
  },
  {
    id: 'free-where-to-start',
    category: 'free',
    render: () => '¿Por dónde empezamos?',
  },
  {
    id: 'free-corpus-ready',
    category: 'free',
    render: () => 'Tu corpus está al día',
  },
  {
    id: 'free-ready-to-review',
    category: 'free',
    render: () => 'Listo para revisar',
  },
  {
    id: 'free-pick-a-thread',
    category: 'free',
    render: () => 'Elige por dónde tirar del hilo',
  },
  // ── playful name-aware (filtered out when no name stored) ────────────
  {
    id: 'playful-welcome-back',
    category: 'playful',
    render: ({ name }) => (name ? `Bienvenido de vuelta, ${name}` : null),
  },
  {
    id: 'playful-hello-again',
    category: 'playful',
    render: ({ name }) => (name ? `Hola de nuevo, ${name}` : null),
  },
  {
    id: 'playful-good-to-see',
    category: 'playful',
    render: ({ name }) => (name ? `Qué bien verte, ${name}` : null),
  },
  {
    id: 'playful-greeting-question',
    category: 'playful',
    render: ({ name }) => (name ? `${name}, ¿qué leemos hoy?` : null),
  },
  // ── extra time-aware variants for breadth ───────────────────────────
  {
    id: 'time-morning-coffee',
    category: 'time',
    render: ({ bucket, name }) =>
      bucket === 'morning' ? (name ? `Café y al lío, ${name}` : 'Café y al lío') : null,
  },
  {
    id: 'time-afternoon-focus',
    category: 'time',
    render: ({ bucket }) => (bucket === 'afternoon' ? 'Foco para la tarde' : null),
  },
  {
    id: 'time-evening-quiet',
    category: 'time',
    render: ({ bucket }) => (bucket === 'evening' ? 'Tarde tranquila para leer' : null),
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface Greeting {
  /** Full headline, ready to render. */
  text: string;
  /** Bucket used to render — exposed for tests + future analytics. */
  bucket: TimeBucket;
  /** Whether the user's display name was injected. */
  named: boolean;
  /** Pool entry id (for #248 no-repeat-twice + future analytics). */
  id: string;
  /** Which broad category the picked entry belongs to. */
  category: GreetingCategory;
}

/**
 * Pick a greeting for the current moment.
 *
 * Selection rules:
 *   1. Build context (time bucket + stored name).
 *   2. Filter the pool to entries that apply (`render(ctx) !== null`).
 *   3. Drop the previously-shown id so the same line never appears
 *      twice in a row.
 *   4. Uniform-random pick from the remaining set; persist the id.
 *
 * Determinism for tests: pass a custom `rng` (defaults to `Math.random`).
 * The `now` param lets tests fix the time without monkey-patching globals.
 */
export function pickGreeting(now: Date = new Date(), rng: () => number = Math.random): Greeting {
  const ctx: GreetingContext = {
    bucket: bucketFor(now.getHours()),
    name: readStoredUserName(),
  };

  const lastId = readLastGreetingId();

  // Materialise text once so we know which entries are applicable.
  const applicable = GREETING_POOL.map((entry) => ({ entry, text: entry.render(ctx) }))
    .filter((row): row is { entry: GreetingEntry; text: string } => row.text !== null);

  // Drop the previous pick when we have alternatives left — never strand
  // ourselves with an empty set (e.g. only one applicable entry).
  const candidates = applicable.length > 1
    ? applicable.filter((row) => row.entry.id !== lastId)
    : applicable;

  const pick = candidates[Math.floor(rng() * candidates.length)];
  saveLastGreetingId(pick.entry.id);

  return {
    text: pick.text,
    bucket: ctx.bucket,
    named: ctx.name !== null,
    id: pick.entry.id,
    category: pick.entry.category,
  };
}
