// Acting on rows: yours anywhere, anyone's on a private board.
//
// The secret handed back at creation is the proof on the public wall, and the
// comparison happens inside the WHERE clause, so a wrong secret and a missing
// row are the same non-event: zero rows changed, no oracle. Secrets are
// compared as text, because an arbitrary string arriving over the wire against
// a UUID column must be a mismatch, never a cast error.
//
// `board` is the second way in, and it is null unless the caller has proven
// they are inside a PRIVATE board. On one of those, anyone who knows the word
// can reword or take down anything, the way somebody standing at a real
// corkboard can. The route decides that, never this module: passing the public
// wall's id here would hand every stranger a takedown button.
//
// A null board can never match, because `board_id = NULL` is NULL and not
// true, so the secret stays the only key on the public wall.

// .ts extension on purpose, same as wall.ts: node --test strips types but
// does not resolve extensionless specifiers.
import { sql } from "./db.ts";

export async function takedownNote(id: number, secret: string, board: number | null): Promise<boolean> {
  const rows = await sql`
    UPDATE nodes SET status = 'removed'
    WHERE id = ${id} AND status = 'approved'
      AND (secret::text = ${secret} OR board_id = ${board})
    RETURNING id
  `;
  return rows.length === 1;
}

export async function rewordNote(
  id: number,
  secret: string,
  body: string,
  board: number | null
): Promise<boolean> {
  const rows = await sql`
    UPDATE nodes SET body = ${body}
    WHERE id = ${id} AND status = 'approved'
      AND (secret::text = ${secret} OR board_id = ${board})
    RETURNING id
  `;
  return rows.length === 1;
}

// A string carries no board of its own; it belongs to the wall its ends are
// pinned to, so the board test goes through the note it starts at.
export async function untieEdge(id: number, secret: string, board: number | null): Promise<boolean> {
  const rows = await sql`
    UPDATE edges SET status = 'removed'
    WHERE id = ${id} AND status = 'approved'
      AND (
        secret::text = ${secret}
        OR EXISTS (SELECT 1 FROM nodes n WHERE n.id = edges.source_id AND n.board_id = ${board})
      )
    RETURNING id
  `;
  return rows.length === 1;
}

// Stamps stay yours alone, on every board. A stamp is a mark somebody made,
// not content anyone has to live with, and taking one back off someone else's
// note is editing what they thought rather than what the wall says.
export async function removeStamp(id: number, secret: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM reactions
    WHERE id = ${id} AND secret::text = ${secret}
    RETURNING id
  `;
  return rows.length === 1;
}
