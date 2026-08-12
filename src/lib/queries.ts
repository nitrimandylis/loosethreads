import { sql, ensureSchema } from "@/lib/db";
import { boardBySlug, PUBLIC_SLUG } from "@/lib/boards";

export type NoteRow = {
  id: number;
  body: string;
  x: number;
  y: number;
  created_at: string;
  reactions: Record<string, number>;
};

export type EdgeRow = {
  id: number;
  source_id: number;
  target_id: number;
};

const EMPTY = { notes: [], edges: [] };

/**
 * The public wall, by slug rather than by id, because "/" does not know one.
 *
 * ponytail: render an empty board (not a 500) before a DB is wired up, so the
 * canvas is viewable on first run. Real queries still surface their errors.
 * The guard lives here and not in getApprovedBoard because a private board
 * without a database is not an empty wall, it is a wall that does not exist.
 */
export async function getPublicBoard(): Promise<{ notes: NoteRow[]; edges: EdgeRow[] }> {
  if (!process.env.DATABASE_URL) return EMPTY;
  await ensureSchema();
  const board = await boardBySlug(PUBLIC_SLUG);
  return board ? getApprovedBoard(board.id) : EMPTY;
}

export async function getApprovedBoard(boardId: number): Promise<{ notes: NoteRow[]; edges: EdgeRow[] }> {
  await ensureSchema();
  const rows = (await sql`
    SELECT n.id, n.body, n.x, n.y, n.created_at,
           COALESCE(
             jsonb_object_agg(r.kind, r.cnt) FILTER (WHERE r.kind IS NOT NULL),
             '{}'::jsonb
           ) AS reactions
    FROM nodes n
    LEFT JOIN (
      SELECT node_id, kind, count(*)::int AS cnt FROM reactions GROUP BY node_id, kind
    ) r ON r.node_id = n.id
    WHERE n.status = 'approved' AND n.board_id = ${boardId}
    GROUP BY n.id
    ORDER BY n.id
  `) as NoteRow[];
  const notes = rows;
  // Only show an edge when both endpoints are approved AND the edge is approved.
  // Scoping either endpoint to the board is enough, because a string can only
  // ever be tied between two notes on the same wall (see /api/submit), but both
  // are scoped so a bug there cannot leak a note into another board's read.
  const edges = (await sql`
    SELECT e.id, e.source_id, e.target_id
    FROM edges e
    JOIN nodes s ON s.id = e.source_id AND s.status = 'approved' AND s.board_id = ${boardId}
    JOIN nodes t ON t.id = e.target_id AND t.status = 'approved' AND t.board_id = ${boardId}
    WHERE e.status = 'approved'
  `) as EdgeRow[];
  return { notes, edges };
}

// What the moderator sees: the live board, not a queue. Nothing waits for
// approval any more, so this reads exactly what the public sees, newest first,
// with the controls to edit or take it down. Reactions aren't joined because
// they're never edited or removed here.
export type LiveNote = Omit<NoteRow, "reactions">;
export type LiveEdge = EdgeRow & {
  created_at: string;
  source_body: string;
  target_body: string;
};

export async function getLiveBoard(boardId: number): Promise<{ notes: LiveNote[]; edges: LiveEdge[] }> {
  await ensureSchema();
  const notes = (await sql`
    SELECT id, body, x, y, created_at
    FROM nodes WHERE status = 'approved' AND board_id = ${boardId} ORDER BY id DESC
  `) as LiveNote[];
  const edges = (await sql`
    SELECT e.id, e.source_id, e.target_id, e.created_at,
           s.body AS source_body, t.body AS target_body
    FROM edges e
    JOIN nodes s ON s.id = e.source_id AND s.board_id = ${boardId}
    JOIN nodes t ON t.id = e.target_id AND t.board_id = ${boardId}
    WHERE e.status = 'approved' ORDER BY e.id DESC
  `) as LiveEdge[];
  return { notes, edges };
}
