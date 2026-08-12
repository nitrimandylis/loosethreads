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
//
// Falls back to the public wall when there is no window, the same way the
// secrets in mine.ts read as empty on the server. A note's tray is the only
// thing that asks, it is never rendered until somebody picks a note up, and by
// then this is running in a browser.
export function currentSlug(): string {
  if (typeof window === "undefined") return "";
  const m = /^\/b\/([a-z2-9]+)/.exec(window.location.pathname);
  return m ? m[1] : "";
}

/**
 * Is this a private board?
 *
 * Every board reachable at /b/<slug> has a passphrase, so the slug is the
 * whole test. It decides what the controls offer, not what is allowed: the
 * server checks the board on every write regardless of what the page drew.
 */
export function onPrivateBoard(): boolean {
  return currentSlug() !== "";
}

/** POST JSON to a board-scoped endpoint. The slug rides along on every call. */
export function postApi(
  path: "/api/submit" | "/api/manage" | "/api/board/move",
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, slug: currentSlug() }),
  });
}
