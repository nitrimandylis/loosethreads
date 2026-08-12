import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { allowUnlock } from "@/lib/ratelimit";
import { boardAccess, grantAccess } from "@/lib/access";
import { verifyPassphrase } from "@/lib/boards";

/**
 * Trading the passphrase for the cookie that opens a board.
 *
 * The rate limit is the point of this route as much as the check is: a shared
 * word is only as private as the number of guesses somebody gets at it.
 */
export async function POST(req: Request) {
  if (!(await allowUnlock(req))) {
    return NextResponse.json({ error: "Too many tries. Wait a bit." }, { status: 429 });
  }
  await ensureSchema();

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const data = payload as Record<string, unknown>;
  const slug = typeof data.slug === "string" ? data.slug : "";
  const passphrase = typeof data.passphrase === "string" ? data.passphrase : "";

  const access = await boardAccess(slug);
  // A board that does not exist and a wrong word answer the same way. The page
  // behind this already 404s an unknown slug, so this is only closing the gap
  // for someone posting straight at the route.
  if (!access || !(await verifyPassphrase(access.board, passphrase))) {
    return NextResponse.json({ error: "That is not the word." }, { status: 403 });
  }

  await grantAccess(access.board);
  return NextResponse.json({ ok: true });
}
