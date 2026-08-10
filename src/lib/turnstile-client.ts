/**
 * One Turnstile widget for the whole board.
 *
 * Two things forced this. A token is single-use, so a widget that lives inside
 * the compose sheet can only ever pay for one action, and tying a string is an
 * action too: the submit route asks for a token on edges as well as notes.
 * And the compose sheet is a sheet of paper now, which is no place for a
 * Cloudflare box.
 *
 * So the widget is rendered once, invisibly, in execute mode, and every
 * submission asks it for a fresh token. If Turnstile is not configured, or is
 * slow, or fails, this resolves to null and the server decides what that is
 * worth: in development it skips the check, in production it refuses the write.
 */

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const TIMEOUT_MS = 12_000;

let widgetId: string | null = null;
let pending: ((token: string | null) => void) | null = null;

function settle(token: string | null) {
  const resolve = pending;
  pending = null;
  resolve?.(token);
}

/** Called once, when the board mounts and the Turnstile script is ready. */
export function mountTurnstile(el: HTMLElement, sitekey: string): void {
  if (widgetId !== null || !window.turnstile) return;
  widgetId = window.turnstile.render(el, {
    sitekey,
    // Nothing shows until the widget actually needs the visitor, and it only
    // runs when we ask for a token rather than on page load.
    execution: "execute",
    appearance: "interaction-only",
    callback: (token: string) => settle(token),
    "error-callback": () => settle(null),
    "timeout-callback": () => settle(null),
  });
}

// A token fetched while the visitor is still writing, so "Pin it" spends its
// click on the network rather than on the widget. Tokens are single-use and
// expire, so the stash is taken at most once and goes stale after 90s.
let stash: { token: Promise<string | null>; at: number } | null = null;
const STASH_MS = 90_000;

export function prefetchToken(): void {
  if (!stash || Date.now() - stash.at > STASH_MS) {
    stash = { token: getToken(), at: Date.now() };
  }
}

export async function takeToken(): Promise<string | null> {
  const s = stash;
  stash = null;
  if (s && Date.now() - s.at <= STASH_MS) {
    const t = await s.token;
    if (t) return t;
  }
  return getToken();
}

export function getToken(): Promise<string | null> {
  const ts = window.turnstile;
  if (!ts || widgetId === null) return Promise.resolve(null);

  // A second request while one is in flight abandons the first rather than
  // stacking callbacks: the visitor only ever waits on their latest action.
  settle(null);

  return new Promise((resolve) => {
    pending = resolve;
    const id = widgetId as string;
    try {
      ts.reset(id);
      ts.execute(id);
    } catch {
      settle(null);
      return;
    }
    // Only give up on this request; a later one has its own clock.
    setTimeout(() => {
      if (pending === resolve) settle(null);
    }, TIMEOUT_MS);
  });
}
