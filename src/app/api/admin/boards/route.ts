import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { createBoard, deleteBoard, rotateToken, setPassphrase, validSlug } from "@/lib/boards";

/** Shortest word worth calling a passphrase. It is shared out loud, not typed by a machine. */
const MIN_PASS = 4;

/**
 * Making and re-keying private boards. Admin only.
 *
 * ponytail: board creation is a button in the moderation console rather than a
 * self-serve route on the public wall, because exactly one person has asked for
 * a board so far. "Start a board" is one more route on the day a second person
 * does.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "No." }, { status: 403 });
  }
  await ensureSchema();

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const data = payload as Record<string, unknown>;
  const passphrase = typeof data.passphrase === "string" ? data.passphrase.trim() : "";

  if (data.action === "create") {
    if (passphrase.length < MIN_PASS) {
      return NextResponse.json(
        { error: `A passphrase needs at least ${MIN_PASS} characters.` },
        { status: 400 }
      );
    }
    const board = await createBoard(passphrase);
    return NextResponse.json({ ok: true, slug: board.slug });
  }

  // Everything below names an existing private board.
  const slug = typeof data.slug === "string" ? data.slug : "";
  if (!validSlug(slug)) {
    return NextResponse.json({ error: "No such board." }, { status: 400 });
  }

  if (data.action === "rotate") {
    // Everyone holding a cookie for this board is out on their next request.
    const ok = await rotateToken(slug);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "No such board." }, { status: 400 });
  }

  if (data.action === "delete") {
    // The board and everything pinned to it. There is no undo and no record
    // kept, the same deal the rest of the board runs on.
    const ok = await deleteBoard(slug);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "No such board." }, { status: 400 });
  }

  if (data.action === "passphrase") {
    if (passphrase.length < MIN_PASS) {
      return NextResponse.json(
        { error: `A passphrase needs at least ${MIN_PASS} characters.` },
        { status: 400 }
      );
    }
    // Replacing the word rotates the token too, so the old word stops working
    // for the people already inside rather than only for new arrivals.
    const ok = await setPassphrase(slug, passphrase);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "No such board." }, { status: 400 });
  }

  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
