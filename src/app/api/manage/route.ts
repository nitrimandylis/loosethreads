import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { allowManage } from "@/lib/ratelimit";
import { boardAccess } from "@/lib/access";
import { isOpen } from "@/lib/boards";
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

  // You have to be on the board before anything you send means anything on it.
  const access = typeof data.slug === "string" ? await boardAccess(data.slug) : null;
  if (!access || !access.unlocked) {
    return NextResponse.json({ error: "No such board." }, { status: 403 });
  }

  // The one line that decides who may edit what.
  //
  // On a PRIVATE board everyone inside can reword, take down and untie
  // anything, because the people on one were told the word by somebody: it is
  // a group, and a group can be asked to stop. The public wall is strangers,
  // so it stays null and the per-row secret remains the only key there. Passing
  // the public board's id here would hand every visitor a takedown button on
  // everybody else's rumours.
  const board = isOpen(access.board) ? null : access.board.id;

  const id = Number(data.id);
  const secret = typeof data.secret === "string" ? data.secret : "";
  // A secret is still required on the public wall, where it is the only key.
  // Inside a private board there is nothing to prove: you are already in.
  if (!Number.isInteger(id) || (!secret && board === null)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  let changed = false;
  if (data.action === "takedown") {
    changed = await takedownNote(id, secret, board);
  } else if (data.action === "reword") {
    const body = typeof data.body === "string" ? data.body.trim() : "";
    if (!body || body.length > MAX_BODY) {
      return NextResponse.json({ error: `Note must be 1-${MAX_BODY} characters.` }, { status: 400 });
    }
    changed = await rewordNote(id, secret, body, board);
  } else if (data.action === "untie") {
    changed = await untieEdge(id, secret, board);
  } else if (data.action === "unstamp") {
    // Stamps are yours alone everywhere, so this one never takes the board.
    changed = await removeStamp(id, secret);
  } else {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!changed) {
    return NextResponse.json({ error: "Not yours, or already gone." }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
