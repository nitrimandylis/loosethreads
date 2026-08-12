import { cookies } from "next/headers";
import { boardBySlug, tokenOpens, validSlug, PUBLIC_SLUG, type Board } from "@/lib/boards";

/**
 * The gate, in one place.
 *
 * Every read and every write of a private board goes through boardAccess().
 * Gating only the page would leave POST /api/submit open to anyone who learned
 * a slug, which is the entire attack: the wall would look locked and still take
 * anything anyone sent it.
 */

// One cookie per board, so being in one board is not being in another. The
// slug is validated before it ever reaches here, so it cannot smuggle
// characters into a cookie name.
export function cookieName(slug: string): string {
  return `lt_b_${slug}`;
}

export type Access = { board: Board; unlocked: boolean };

/**
 * null means there is no such board: a bad slug and an invented one are the
 * same answer, so probing learns nothing from the difference.
 */
export async function boardAccess(slug: string): Promise<Access | null> {
  if (slug !== PUBLIC_SLUG && !validSlug(slug)) return null;
  const board = await boardBySlug(slug);
  if (!board) return null;
  const token = (await cookies()).get(cookieName(slug))?.value;
  return { board, unlocked: tokenOpens(board, token) };
}

/** For route handlers: the board id if the caller is inside, otherwise null. */
export async function unlockedBoardId(slug: unknown): Promise<number | null> {
  if (typeof slug !== "string") return null;
  const access = await boardAccess(slug);
  return access && access.unlocked ? access.board.id : null;
}

export async function grantAccess(board: Board): Promise<void> {
  (await cookies()).set(cookieName(board.slug), board.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // ponytail: Path=/ deliberately, not /b/<slug>. Scoping the cookie to the
    // board's path reads better and breaks posting: the browser would not send
    // it to /api/submit. The slug is in the cookie NAME instead, which
    // separates boards just as well.
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
