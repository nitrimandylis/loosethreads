// Acting on your own rows, proven by the secret handed back at creation.
// The secret comparison happens inside the WHERE clause, so a wrong secret
// and a missing row are the same non-event: zero rows changed, no oracle.
// Secrets are compared as text: an arbitrary string arriving over the wire
// against a UUID column must be a mismatch, never a cast error.

// .ts extension on purpose, same as wall.ts: node --test strips types but
// does not resolve extensionless specifiers.
import { sql } from "./db.ts";

export async function takedownNote(id: number, secret: string): Promise<boolean> {
  const rows = await sql`
    UPDATE nodes SET status = 'removed'
    WHERE id = ${id} AND secret::text = ${secret} AND status = 'approved'
    RETURNING id
  `;
  return rows.length === 1;
}

export async function rewordNote(id: number, secret: string, body: string): Promise<boolean> {
  const rows = await sql`
    UPDATE nodes SET body = ${body}
    WHERE id = ${id} AND secret::text = ${secret} AND status = 'approved'
    RETURNING id
  `;
  return rows.length === 1;
}

export async function untieEdge(id: number, secret: string): Promise<boolean> {
  const rows = await sql`
    UPDATE edges SET status = 'removed'
    WHERE id = ${id} AND secret::text = ${secret} AND status = 'approved'
    RETURNING id
  `;
  return rows.length === 1;
}

export async function removeStamp(id: number, secret: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM reactions
    WHERE id = ${id} AND secret::text = ${secret}
    RETURNING id
  `;
  return rows.length === 1;
}
