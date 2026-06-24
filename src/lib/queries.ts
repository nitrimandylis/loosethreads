import { sql, ensureSchema } from "@/lib/db";

export type NoteRow = {
  id: number;
  topic: string;
  body: string;
  x: number;
  y: number;
};

export type EdgeRow = {
  id: number;
  source_id: number;
  target_id: number;
};

export async function getApprovedBoard(): Promise<{ notes: NoteRow[]; edges: EdgeRow[] }> {
  // ponytail: render an empty board (not a 500) before a DB is wired up, so the
  // canvas is viewable on first run. Real queries still surface their errors.
  if (!process.env.DATABASE_URL) return { notes: [], edges: [] };
  await ensureSchema();
  const notes = (await sql`
    SELECT id, topic, body, x, y FROM nodes WHERE status = 'approved' ORDER BY id
  `) as NoteRow[];
  // Only show an edge when both endpoints are approved AND the edge is approved.
  const edges = (await sql`
    SELECT e.id, e.source_id, e.target_id
    FROM edges e
    JOIN nodes s ON s.id = e.source_id AND s.status = 'approved'
    JOIN nodes t ON t.id = e.target_id AND t.status = 'approved'
    WHERE e.status = 'approved'
  `) as EdgeRow[];
  return { notes, edges };
}

export type PendingNote = NoteRow & { status: string; created_at: string };
export type PendingEdge = EdgeRow & {
  created_at: string;
  source_body: string;
  target_body: string;
};

export async function getQueue(): Promise<{ notes: PendingNote[]; edges: PendingEdge[] }> {
  await ensureSchema();
  const notes = (await sql`
    SELECT id, topic, body, x, y, status, created_at
    FROM nodes WHERE status = 'pending' ORDER BY created_at
  `) as PendingNote[];
  const edges = (await sql`
    SELECT e.id, e.source_id, e.target_id, e.created_at,
           s.body AS source_body, t.body AS target_body
    FROM edges e
    JOIN nodes s ON s.id = e.source_id
    JOIN nodes t ON t.id = e.target_id
    WHERE e.status = 'pending' ORDER BY e.created_at
  `) as PendingEdge[];
  return { notes, edges };
}
