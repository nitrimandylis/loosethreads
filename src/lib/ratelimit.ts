import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ponytail: rate limit only wired up when Upstash env is present. Missing env =>
// no limit (fine for local dev). In production set the Upstash vars or the
// public submit endpoint is unthrottled.
const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const limiter = hasUpstash
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(5, "10 m"),
      prefix: "gossip:submit",
    })
  : null;

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "anon";
}

export async function allow(req: Request): Promise<boolean> {
  if (!limiter) return true;
  const { success } = await limiter.limit(clientIp(req));
  return success;
}
