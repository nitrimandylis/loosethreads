import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { allowNote, allowEdge, allowReaction, clientIp, hasUpstash } from "@/lib/ratelimit";
import { verifyTurnstile, hasTurnstile } from "@/lib/turnstile";
import { TOPIC_IDS, placeInTopic, type Point } from "@/lib/topics";
import { isStamp } from "@/lib/reactions";
import { MAX_BODY } from "@/lib/limits";

/**
 * Everything here publishes immediately. There is no moderation queue, so the
 * rate limit and the bot check are the only things between a stranger and the
 * public board.
 *
 * Both of those fail OPEN when unconfigured, which was the right call when a
 * human queue backstopped them and is the wrong call now. So in production we
 * refuse writes outright rather than serve an unthrottled anonymous write
 * endpoint. If the env is missing, the worst case is that nobody can post,
 * not that anybody can post anything at any rate.
 */
function gateClosed(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  return !hasUpstash || !hasTurnstile;
}

const CLOSED = NextResponse.json(
  { error: "Submissions are closed right now." },
  { status: 503 }
);

export async function POST(req: Request) {
  if (gateClosed()) {
    console.error(
      "submit refused: production gate incomplete " +
        `(upstash=${hasUpstash}, turnstile=${hasTurnstile}). ` +
        "Set UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, TURNSTILE_SECRET_KEY " +
        "and NEXT_PUBLIC_TURNSTILE_SITE_KEY."
    );
    return CLOSED;
  }

  await ensureSchema();

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const data = payload as Record<string, unknown>;
  const ip = clientIp(req);
  const token = typeof data.turnstileToken === "string" ? data.turnstileToken : null;

  // ---- Reaction: a counter on something already public ----
  if (data.type === "reaction") {
    if (!(await allowReaction(req))) return tooMany();
    const nodeId = Number(data.nodeId);
    if (!Number.isInteger(nodeId) || !isStamp(data.kind)) {
      return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
    }
    // No bot check here on purpose: stamps should feel free, and a Turnstile
    // token is single-use so rapid stamping would mean re-solving. Dedupe is
    // per-browser on the client; the bucket above is the real ceiling.
    const ok = await sql`SELECT 1 FROM nodes WHERE id = ${nodeId} AND status = 'approved'`;
    if (ok.length !== 1) {
      return NextResponse.json({ error: "No such note" }, { status: 400 });
    }
    await sql`INSERT INTO reactions (node_id, kind) VALUES (${nodeId}, ${data.kind})`;
    return NextResponse.json({ ok: true });
  }

  // ---- String between two notes ----
  if (data.type === "edge") {
    if (!(await allowEdge(req))) return tooMany();
    const source = Number(data.sourceId);
    const target = Number(data.targetId);
    if (!Number.isInteger(source) || !Number.isInteger(target) || source === target) {
      return NextResponse.json({ error: "Invalid connection" }, { status: 400 });
    }
    if (!(await verifyTurnstile(token, ip))) {
      return NextResponse.json({ error: "Bot check failed. Refresh and retry." }, { status: 403 });
    }
    const ok = await sql`
      SELECT count(*)::int AS n FROM nodes
      WHERE id IN (${source}, ${target}) AND status = 'approved'
    `;
    if (ok[0].n !== 2) {
      return NextResponse.json({ error: "Both notes must exist" }, { status: 400 });
    }
    // Tying the same two notes again is a no-op, not an error: the string is
    // already there. edges_pair_idx treats (a,b) and (b,a) as one pair.
    await sql`
      INSERT INTO edges (source_id, target_id, status)
      VALUES (${source}, ${target}, 'approved')
      ON CONFLICT DO NOTHING
    `;
    return NextResponse.json({ ok: true });
  }

  // ---- Note ----
  if (!(await allowNote(req))) return tooMany();

  const body = typeof data.body === "string" ? data.body.trim() : "";
  const topic = typeof data.topic === "string" ? data.topic : "";

  if (!body || body.length > MAX_BODY) {
    return NextResponse.json({ error: `Note must be 1-${MAX_BODY} characters.` }, { status: 400 });
  }
  if (!TOPIC_IDS.has(topic)) {
    return NextResponse.json({ error: "Unknown topic" }, { status: 400 });
  }
  if (!(await verifyTurnstile(token, ip))) {
    return NextResponse.json({ error: "Bot check failed. Refresh and retry." }, { status: 403 });
  }

  // Place it clear of what's already pinned in that region.
  const neighbours = (await sql`
    SELECT x, y FROM nodes WHERE topic = ${topic} AND status = 'approved'
  `) as Point[];
  const { x, y } = placeInTopic(topic, neighbours);

  // Hand the row back. It is public the instant this returns, so the board
  // pins it straight away rather than making the person who wrote it reload to
  // find out whether it worked. It needs the real id and the real coordinates:
  // a guessed position would move under them on the next load.
  const [note] = (await sql`
    INSERT INTO nodes (topic, body, x, y, status)
    VALUES (${topic}, ${body}, ${x}, ${y}, 'approved')
    RETURNING id, topic, body, x, y, created_at
  `) as { id: number }[];

  return NextResponse.json({ ok: true, note: { ...note, reactions: {} } });
}

function tooMany() {
  return NextResponse.json({ error: "Slow down. Too many submissions." }, { status: 429 });
}
