import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { allowManage } from "@/lib/ratelimit";
import { takedownNote, rewordNote, untieEdge, removeStamp } from "@/lib/manage";
import { MAX_BODY } from "@/lib/limits";

/**
 * Acting on your own rows: take a note down, reword it, untie a string,
 * take back a stamp. The proof is the secret handed back at creation, which
 * ties the request to something this browser actually created, and the worst a
 * replay can do is re-remove something already removed. The rate limit is here
 * only to cap that replay.
 */
export async function POST(req: Request) {
  if (!(await allowManage(req))) {
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
  const id = Number(data.id);
  const secret = typeof data.secret === "string" ? data.secret : "";
  if (!Number.isInteger(id) || !secret) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  let changed = false;
  if (data.action === "takedown") {
    changed = await takedownNote(id, secret);
  } else if (data.action === "reword") {
    const body = typeof data.body === "string" ? data.body.trim() : "";
    if (!body || body.length > MAX_BODY) {
      return NextResponse.json({ error: `Note must be 1-${MAX_BODY} characters.` }, { status: 400 });
    }
    changed = await rewordNote(id, secret, body);
  } else if (data.action === "untie") {
    changed = await untieEdge(id, secret);
  } else if (data.action === "unstamp") {
    changed = await removeStamp(id, secret);
  } else {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!changed) {
    return NextResponse.json({ error: "Not yours, or already gone." }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
