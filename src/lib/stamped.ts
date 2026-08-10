/**
 * Which stamps this browser has already used, so one person can't sit there
 * putting CONFIRMED 400 on a note.
 *
 * Client-side only, and trivially bypassed by anyone who opens devtools or a
 * second browser. That's the deal: it stops the casual mashing, which is every
 * real case, without storing anything about visitors on a board whose whole
 * selling point is that it knows nothing about them. The rate-limit bucket is
 * the actual ceiling.
 *
 * Exposed as an external store rather than component state because it lives
 * outside React and doesn't exist on the server. useSyncExternalStore gives it
 * a server snapshot, so the markup matches on hydration without an effect.
 */
const KEY = "lt:stamped";

type Stamped = Record<string, true>;

const EMPTY: Stamped = {};
const listeners = new Set<() => void>();

// getSnapshot must return a stable reference or useSyncExternalStore spins,
// so the parsed value is cached and only rebuilt after a write.
let cache: Stamped | null = null;

const slot = (nodeId: number, kind: string) => `${nodeId}:${kind}`;

function read(): Stamped {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stamped) : {};
  } catch {
    // private mode, storage disabled, or someone put junk in there
    return {};
  }
}

function write(next: Stamped): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable. The stamp still counted server-side; this browser
    // just won't remember it after a reload. Acceptable.
  }
  cache = next;
  for (const l of listeners) l();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getStamped(): Stamped {
  if (cache === null) cache = read();
  return cache;
}

/** Nothing is stamped as far as the server knows: it has no browser. */
export function getServerStamped(): Stamped {
  return EMPTY;
}

export const isStamped = (all: Stamped, nodeId: number, kind: string): boolean =>
  all[slot(nodeId, kind)] === true;

export function rememberStamp(nodeId: number, kind: string): void {
  write({ ...getStamped(), [slot(nodeId, kind)]: true });
}

export function forgetStamp(nodeId: number, kind: string): void {
  const next = { ...getStamped() };
  delete next[slot(nodeId, kind)];
  write(next);
}
