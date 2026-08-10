/**
 * What this browser created, and the secret that proves it. localStorage,
 * like the stamp memory: clear your browser data and your notes become as
 * permanent as everyone else's. Nothing here ever identifies a person, and
 * nothing marks a note as yours to anyone else; the secret only ever leaves
 * this browser as a proof sent to /api/manage.
 *
 * Read in click handlers and trays only, never during server render, so a
 * plain read function is enough; no external-store machinery needed.
 */
const KEY = "lt:mine";

type Mine = {
  notes: Record<string, string>;
  edges: Record<string, string>;
  stamps: Record<string, { id: number; secret: string }>;
};

const EMPTY: Mine = { notes: {}, edges: {}, stamps: {} };

function read(): Mine {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Mine>;
    return {
      notes: parsed.notes ?? {},
      edges: parsed.edges ?? {},
      stamps: parsed.stamps ?? {},
    };
  } catch {
    // private mode, storage disabled, or someone put junk in there
    return EMPTY;
  }
}

function write(next: Mine): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the thing was still created, this browser just
    // won't be able to manage it later. Same deal as the stamp memory.
  }
}

export function rememberNote(id: number, secret: string): void {
  const m = read();
  write({ ...m, notes: { ...m.notes, [id]: secret } });
}
export function noteSecret(id: number): string | null {
  return read().notes[id] ?? null;
}
export function forgetNote(id: number): void {
  const m = read();
  const notes = { ...m.notes };
  delete notes[id];
  write({ ...m, notes });
}

export function rememberEdge(id: number, secret: string): void {
  const m = read();
  write({ ...m, edges: { ...m.edges, [id]: secret } });
}
export function edgeSecret(id: number): string | null {
  return read().edges[id] ?? null;
}
export function forgetEdge(id: number): void {
  const m = read();
  const edges = { ...m.edges };
  delete edges[id];
  write({ ...m, edges });
}

const stampSlot = (nodeId: number, kind: string) => `${nodeId}:${kind}`;

export function rememberStampProof(nodeId: number, kind: string, id: number, secret: string): void {
  const m = read();
  write({ ...m, stamps: { ...m.stamps, [stampSlot(nodeId, kind)]: { id, secret } } });
}
export function stampProof(nodeId: number, kind: string): { id: number; secret: string } | null {
  return read().stamps[stampSlot(nodeId, kind)] ?? null;
}
export function forgetStampProof(nodeId: number, kind: string): void {
  const m = read();
  const stamps = { ...m.stamps };
  delete stamps[stampSlot(nodeId, kind)];
  write({ ...m, stamps });
}
