import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ponytail: rate limit only wired up when Upstash env is present. Missing env =>
// no limit (fine for local dev). In production set the Upstash vars or the
// public submit endpoint is unthrottled.
const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasUpstash ? Redis.fromEnv() : null;

const submitLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "10 m"), prefix: "gossip:submit" })
  : null;

// Tighter bucket for admin login attempts — brute-force protection on the only
// real auth gate in the app.
const loginLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "15 m"), prefix: "gossip:login" })
  : null;

// ponytail: trust the proxy-set client IP, not the attacker-controlled left-most
// X-Forwarded-For. On Vercel `x-real-ip` is set by the trusted ingress; fall back
// to the right-most XFF hop (closest to our proxy), then to a shared "anon"
// bucket (deny-by-default-ish: unidentified requests share one strict bucket).
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

export async function allow(req: Request): Promise<boolean> {
  if (!submitLimiter) return true;
  const { success } = await submitLimiter.limit(clientIp(req));
  return success;
}

export async function allowLogin(req: Request): Promise<boolean> {
  if (!loginLimiter) return true;
  const { success } = await loginLimiter.limit(clientIp(req));
  return success;
}
