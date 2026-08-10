import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { editedBody, rowId } from "../decision";

export { editedBody, rowId };

/**
 * Moderation acts on live content now: there is no approve step, only edit and
 * remove. Removal is soft (status='removed'), which the public board read
 * already filters out, so a removed note and its strings vanish together
 * without touching the read path.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  const data = (await req.json().catch(() => ({}))) as {
    kind?: unknown;
    id?: unknown;
    action?: unknown;
    body?: unknown;
  };

  const kind = data.kind === "node" || data.kind === "edge" ? data.kind : null;
  const action = data.action === "edit" || data.action === "remove" ? data.action : null;
  const id = rowId(data.id);

  if (!kind || !action || id === null) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (action === "edit" && kind !== "node") {
    return NextResponse.json({ error: "Only notes can be edited" }, { status: 400 });
  }

  // RETURNING so a zero-row update is reported as a miss. The old route sent
  // back {ok:true} whether or not the row existed, so the UI showed success
  // for approving an id that wasn't there.
  let changed: { id: number }[];

  if (action === "remove") {
    changed = (
      kind === "node"
        ? await sql`UPDATE nodes SET status = 'removed' WHERE id = ${id} AND status = 'approved' RETURNING id`
        : await sql`UPDATE edges SET status = 'removed' WHERE id = ${id} AND status = 'approved' RETURNING id`
    ) as { id: number }[];
  } else {
    const body = editedBody(data.body);
    if (body === null) {
      return NextResponse.json({ error: "Note must be 1-500 characters." }, { status: 400 });
    }
    changed = (await sql`
      UPDATE nodes SET body = ${body} WHERE id = ${id} AND status = 'approved' RETURNING id
    `) as { id: number }[];
  }

  if (changed.length !== 1) {
    return NextResponse.json({ error: "Not found, or already gone." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
