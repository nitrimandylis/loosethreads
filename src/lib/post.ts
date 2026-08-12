/**
 * Posting to the board this browser is currently looking at.
 *
 * The slug comes off the URL rather than being threaded down through Board,
 * Note and the compose sheet as a prop. Six call sites needed it, none of them
 * for anything except putting it in a request body, and reading it from the
 * address bar cannot drift out of sync with the wall on screen.
 *
 * Client only, like mine.ts: it reads window.location, so it is never touched
 * during a server render.
 */
// The empty string is the public wall, matching PUBLIC_SLUG in boards.ts.
// Not imported from there: boards.ts pulls in node:crypto and the database
// driver, and none of that belongs in a browser bundle for one constant.
export function currentSlug(): string {
  const m = /^\/b\/([a-z2-9]+)/.exec(window.location.pathname);
  return m ? m[1] : "";
}

/** POST JSON to a board-scoped endpoint. The slug rides along on every call. */
export function postApi(
  path: "/api/submit" | "/api/manage",
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, slug: currentSlug() }),
  });
}
