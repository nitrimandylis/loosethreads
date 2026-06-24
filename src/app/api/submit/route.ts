import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { allow, clientIp } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { TOPIC_IDS, placeInTopic } from "@/lib/topics";
import { isStamp } from "@/lib/reactions";

const MAX_BODY = 500;

export async function POST(req: Request) {
  await ensureSchema();

  if (!(await allow(req))) {
    return NextResponse.json({ error: "Slow down — too many submissions." }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const data = payload as Record<string, unknown>;
  const ip = clientIp(req);

  // ---- Reaction (public, not moderated) ----
  if (data.type === "reaction") {
    const nodeId = Number(data.nodeId);
    if (!Number.isInteger(nodeId) || !isStamp(data.kind)) {
      return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
    }
    // ponytail: no per-user dedupe — friend-scale, a little spam is fine.
    const ok = await sql`SELECT 1 FROM nodes WHERE id = ${nodeId} AND status = 'approved'`;
    if (ok.length !== 1) {
      return NextResponse.json({ error: "No such note" }, { status: 400 });
    }
    await sql`INSERT INTO reactions (node_id, kind) VALUES (${nodeId}, ${data.kind})`;
    return NextResponse.json({ ok: true });
  }

  // ---- Edge submission (connect two existing approved notes) ----
  if (data.type === "edge") {
    const source = Number(data.sourceId);
    const target = Number(data.targetId);
    if (!Number.isInteger(source) || !Number.isInteger(target) || source === target) {
      return NextResponse.json({ error: "Invalid connection" }, { status: 400 });
    }
    // ponytail: edges aren't LLM-screened or captcha-gated — only the rate limit
    // guards them. The link is meaningless until BOTH endpoints are approved and
    // a human approves the edge in the queue. Add screening if edges get abused.
    const ok = await sql`
      SELECT count(*)::int AS n FROM nodes
      WHERE id IN (${source}, ${target}) AND status = 'approved'
    `;
    if (ok[0].n !== 2) {
      return NextResponse.json({ error: "Both notes must exist" }, { status: 400 });
    }
    await sql`INSERT INTO edges (source_id, target_id) VALUES (${source}, ${target})`;
    return NextResponse.json({ ok: true });
  }

  // ---- Note submission ----
  const body = typeof data.body === "string" ? data.body.trim() : "";
  const topic = typeof data.topic === "string" ? data.topic : "";
  const turnstileToken = typeof data.turnstileToken === "string" ? data.turnstileToken : null;

  if (!body || body.length > MAX_BODY) {
    return NextResponse.json({ error: `Note must be 1–${MAX_BODY} characters.` }, { status: 400 });
  }
  if (!TOPIC_IDS.has(topic)) {
    return NextResponse.json({ error: "Unknown topic" }, { status: 400 });
  }
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return NextResponse.json({ error: "Bot check failed. Refresh and retry." }, { status: 403 });
  }

  const { x, y } = placeInTopic(topic);

  await sql`
    INSERT INTO nodes (topic, body, x, y, status)
    VALUES (${topic}, ${body}, ${x}, ${y}, 'pending')
  `;

  return NextResponse.json({ ok: true, status: "pending" });
}
