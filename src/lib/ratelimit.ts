import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Rate limiting is only wired up when the Upstash env is present. Missing env
// means no limit, which is fine locally and is NOT fine in production now that
// nothing queues behind a moderator: see requireGate() in the submit route.
export const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasUpstash ? Redis.fromEnv() : null;

// Three buckets, priced by what each action costs. A stamp is a counter on
// something already public; a rumour is permanent public content about a real
// person. Sharing one bucket meant stamping five notes locked you out of
// posting for ten minutes, and friends behind one NAT shared the budget.
function bucket(name: string, count: number, window: "10 m" | "15 m") {
  return redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(count, window), prefix: `gossip:${name}` })
    : null;
}

const noteLimiter = bucket("note", 5, "10 m");
const edgeLimiter = bucket("edge", 15, "10 m");
const reactionLimiter = bucket("reaction", 60, "10 m");
// Tighter bucket for admin login attempts: brute-force protection on the only
// real auth gate in the app.
const loginLimiter = bucket("login", 5, "15 m");
// Managing your own rows: secret-gated already, the bucket just caps replay.
const manageLimiter = bucket("manage", 30, "10 m");

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

async function check(limiter: Ratelimit | null, req: Request): Promise<boolean> {
  if (!limiter) return true;
  const { success } = await limiter.limit(clientIp(req));
  return success;
}

export const allowNote = (req: Request) => check(noteLimiter, req);
export const allowEdge = (req: Request) => check(edgeLimiter, req);
export const allowReaction = (req: Request) => check(reactionLimiter, req);
export const allowLogin = (req: Request) => check(loginLimiter, req);
export const allowManage = (req: Request) => check(manageLimiter, req);
