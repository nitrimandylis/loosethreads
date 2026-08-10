/**
 * Where this browser has dragged notes to. Client-side only, on purpose:
 * the shared wall is untouched, everyone else keeps seeing the note where
 * placement put it. sessionStorage, so a closed tab straightens the wall
 * back out; a buried note is never buried for anyone else or forever.
 */
export type Moves = Record<string, { x: number; y: number }>;

const KEY = "lt:moved";

// An external store, like the stamp memory: the board reads it through
// useSyncExternalStore, so the server render (which has no sessionStorage)
// and the first client render agree, and a write re-renders the board.
const EMPTY: Moves = {};
const listeners = new Set<() => void>();
let cache: Moves | null = null;

function read(): Moves {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Moves) : {};
  } catch {
    return {};
  }
}

export function subscribeMoves(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getMoves(): Moves {
  if (cache === null) cache = read();
  return cache;
}

/** Nothing has moved as far as the server knows: it has no browser. */
export function getServerMoves(): Moves {
  return EMPTY;
}

export function writeMove(id: number, x: number, y: number): void {
  const next = { ...getMoves(), [id]: { x, y } };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the move still applies until the tab closes.
  }
  cache = next;
  for (const l of listeners) l();
}

/** The board's notes with this browser's moves applied. Pure. */
export function applyMoves<T extends { id: number; x: number; y: number }>(
  notes: T[],
  moves: Moves
): T[] {
  if (Object.keys(moves).length === 0) return notes;
  return notes.map((n) => {
    const m = moves[n.id];
    return m ? { ...n, x: m.x, y: m.y } : n;
  });
}
