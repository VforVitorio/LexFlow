/**
 * Time-of-day + name-aware greeting for HomePage (replaces the hardcoded
 * "Buenas tardes, Laura" placeholder, see Sprint 1 roadmap).
 *
 * Acts as the seam where #248 (randomised welcome messages, Claude
 * Desktop style) will plug in later. Until then we keep it deterministic:
 * one greeting per time bucket, with the user's name appended when known.
 *
 * --- WHERE TO CHANGE IF THE GREETING SURFACE EXPANDS ---
 * * Randomisation across an entry pool   → swap the body of `pickGreeting`.
 * * New name source (account vs local)   → swap `readStoredUserName`.
 * * New time bucket                       → extend `bucketFor` + the const map.
 */

/** localStorage key for the user-typed display name (set by #229 step 2 / #115). */
export const USER_NAME_STORAGE_KEY = 'lexflow.user-name';

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
    // Storage unavailable (private mode, sandbox): degrade silently.
    return null;
  }
}

export interface Greeting {
  /** Full headline, ready to render. */
  text: string;
  /** Bucket used to render — exposed for tests + future analytics. */
  bucket: TimeBucket;
  /** Whether the user's display name was injected. */
  named: boolean;
}

/**
 * Build the greeting for the current moment.
 *
 * `now` is injected so callers can test with a fixed time without
 * monkey-patching globals. Production calls `pickGreeting()` and the
 * default uses the runtime clock.
 */
export function pickGreeting(now: Date = new Date()): Greeting {
  const bucket = bucketFor(now.getHours());
  const base = BUCKET_GREETING[bucket];
  const name = readStoredUserName();
  return {
    text: name ? `${base}, ${name}` : base,
    bucket,
    named: name !== null,
  };
}
