import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { allowMove } from "@/lib/ratelimit";
import { boardAccess } from "@/lib/access";
import { isOpen } from "@/lib/boards";

/**
 * Where a note sits, for everyone on a private board.
 *
 * Only private boards. On the public wall a drag stays in the dragger's own
 * sessionStorage (see moved.ts), because a wall strangers are reading cannot
 * have a stranger rearranging it. This route refuses the public wall outright
 * rather than relying on the client not to ask.
 */
export async function POST(req: Request) {
  if (!(await allowMove(req))) {
    return NextResponse.json({ error: "Slow down." }, { status: 429 });
  }
  await ensureSchema();

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const data = payload as Record<string, unknown>;

  const access = typeof data.slug === "string" ? await boardAccess(data.slug) : null;
  if (!access || !access.unlocked || isOpen(access.board)) {
    return NextResponse.json({ error: "No such board." }, { status: 403 });
  }

  const id = Number(data.id);
  const x = Number(data.x);
  const y = Number(data.y);
  // Coordinates come off a drag in a browser, so they are the one input here
  // that is entirely attacker-controlled. Finite only: NaN or Infinity would
  // put a note somewhere the placer can never reach and the viewport cannot
  // frame, which is a wall nobody can use again.
  if (!Number.isInteger(id) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const rows = await sql`
    UPDATE nodes SET x = ${x}, y = ${y}
    WHERE id = ${id} AND status = 'approved' AND board_id = ${access.board.id}
    RETURNING id
  `;
  if (rows.length !== 1) {
    return NextResponse.json({ error: "No such note." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
