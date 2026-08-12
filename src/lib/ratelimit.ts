import { sql, ensureSchema } from "./db.ts";

/**
 * Per-IP rate limiting, counted in the database the board already runs on.
 *
 * This was Upstash Redis. It did not need to be: a rate limit is a count over
 * a time window, which Postgres does natively, and the board cannot function
 * without a database anyway. Redis bought a second service, a second pair of
 * environment variables and a second thing that can be missing on a deploy, in
 * exchange for a query the existing one already answers.
 *
 * What it cannot be is a counter in memory. The limit has to hold across every
 * function instance serving the app at once, and nobody controls how many of
 * those there are, so the count has to live somewhere shared.
 *
 * This is now the only thing standing between a stranger and the public board.
 * Nothing is checked before it publishes and there is no bot check.
 */

/**
 * Buckets priced by what each action costs. A stamp is a counter on something
 * already public; a rumour is permanent public content about a real person.
 * Sharing one bucket meant stamping five notes locked you out of posting for
 * ten minutes, and friends behind one NAT shared the budget.
 */
const BUCKETS = {
  note: { limit: 5, minutes: 10 },
  edge: { limit: 15, minutes: 10 },
  reaction: { limit: 60, minutes: 10 },
  // Tighter, and the one that is not about spam: this is the brute-force
  // protection on ADMIN_SECRET, the only real auth gate in the app.
  login: { limit: 5, minutes: 15 },
  // Managing your own rows is secret-gated already; the bucket caps replay.
  manage: { limit: 30, minutes: 10 },
  // The other real auth gate: a private board's passphrase. Slightly looser
  // than login because the people typing it are reading a word off a screenshot
  // and getting it wrong, not attacking anything. Without this bucket the gate
  // is a guessing game against a word somebody chose, which is not a gate.
  unlock: { limit: 8, minutes: 15 },
} as const;

type Action = keyof typeof BUCKETS;

// Trust the proxy-set client IP, not the attacker-controlled left-most
// X-Forwarded-For. On Vercel `x-real-ip` is set by the trusted ingress; fall
// back to the right-most XFF hop (closest to our proxy), then to a shared
// "anon" bucket (unidentified requests share one strict bucket).
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "anon";
}

/**
 * Count what this IP has done in the window and record this one, in a single
 * statement. The row only goes in when there is still room, which means a
 * refused request never counts against the window it was refused by, and the
 * table only ever grows at the rate of *allowed* actions: a flood cannot
 * inflate it.
 *
 * ponytail: two requests that arrive together can both read the same count and
 * both be let through, so a burst can exceed the limit by the number of
 * concurrent instances. Friend-scale, and the ceiling is a handful of extra
 * notes, not an open door. Reach for SELECT ... FOR UPDATE or a Redis INCR if
 * the exact number ever matters.
 */
async function check(action: Action, req: Request): Promise<boolean> {
  const { limit, minutes } = BUCKETS[action];
  const ip = clientIp(req);
  // Callers hit the limiter before touching anything else, so the table has to
  // be there. ensureSchema caches its promise, so this costs one await.
  await ensureSchema();
  const rows = await sql`
    WITH recent AS (
      SELECT count(*)::int AS n FROM hits
      WHERE ip = ${ip} AND action = ${action}
        AND at > now() - ${minutes}::int * interval '1 minute'
    )
    INSERT INTO hits (ip, action)
    SELECT ${ip}, ${action} FROM recent WHERE n < ${limit}
    RETURNING 1 AS ok
  `;
  return rows.length === 1;
}

export const allowNote = (req: Request) => check("note", req);
export const allowEdge = (req: Request) => check("edge", req);
export const allowReaction = (req: Request) => check("reaction", req);
export const allowLogin = (req: Request) => check("login", req);
export const allowManage = (req: Request) => check("manage", req);
export const allowUnlock = (req: Request) => check("unlock", req);
