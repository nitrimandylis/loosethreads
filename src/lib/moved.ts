/**
 * Where notes have been dragged to, and how long that lasts.
 *
 * On the public wall a drag is yours alone: sessionStorage, so a closed tab
 * straightens the wall back out and a buried note is never buried for anyone
 * else or forever. Nobody can rearrange a wall strangers are reading.
 *
 * On a private board a drag is real and everybody on it sees it, because the
 * people on one are a group who can be asked to stop rather than an internet
 * full of strangers. Those moves go to the server (see stageMove), and what is
 * kept here is only the few hundred milliseconds between letting go of a note
 * and the server agreeing.
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

// A move on a private board that the server has been told about but has not
// echoed back yet. Memory only, never stored: the moment a poll returns the
// note at its new home this is dropped, and the wall is the only record.
let staged: Moves = {};

/**
 * What getMoves hands out, built once per change rather than per call.
 *
 * This has to be one stable object between notifications. useSyncExternalStore
 * calls the snapshot on every render and compares it by identity, so merging
 * the two maps inside getMoves returned a brand new object each time, which
 * React reads as a store that never stops changing: it gives up with "the
 * result of getSnapshot should be cached" and the board hits its error
 * boundary. Only a staged move made the merge run, so the wall came down on
 * the first drag of a private board.
 */
let snapshot: Moves | null = null;

function rebuild() {
  if (cache === null) cache = read();
  // Staged last: a note you just let go of sits where you dropped it, not
  // where this browser happens to have dragged it in some earlier session.
  snapshot = Object.keys(staged).length === 0 ? cache : { ...cache, ...staged };
}

function notify() {
  rebuild();
  for (const l of listeners) l();
}

export function subscribeMoves(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getMoves(): Moves {
  if (snapshot === null) rebuild();
  return snapshot as Moves;
}

/**
 * A private-board move, on its way to the server. Held only so the note does
 * not snap back to its old spot during the round trip.
 */
export function stageMove(id: number, x: number, y: number): void {
  staged = { ...staged, [id]: { x, y } };
  notify();
}

/** Give up on a staged move: the server refused it, so the wall wins. */
export function dropStaged(id: number): void {
  if (!(id in staged)) return;
  const next = { ...staged };
  delete next[id];
  staged = next;
  notify();
}

/**
 * Drop every staged move the server has caught up with.
 *
 * Compared against what came back rather than cleared wholesale on any poll:
 * a poll that fires between letting go of a note and the write landing would
 * otherwise throw the note back to its old spot for fifteen seconds.
 */
export function settleMoves(notes: { id: number; x: number; y: number }[]): void {
  const ids = Object.keys(staged);
  if (ids.length === 0) return;
  const at = new Map(notes.map((n) => [n.id, n]));
  const next: Moves = {};
  let changed = false;
  for (const key of ids) {
    const server = at.get(Number(key));
    const mine = staged[key];
    // Half a pixel: these are doubles that went through JSON and Postgres.
    const settled = server && Math.abs(server.x - mine.x) < 0.5 && Math.abs(server.y - mine.y) < 0.5;
    if (settled) changed = true;
    else next[key] = mine;
  }
  if (!changed) return;
  staged = next;
  notify();
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
  notify();
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
