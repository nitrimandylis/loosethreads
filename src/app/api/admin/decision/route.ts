import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { isAdmin } from "@/lib/admin";

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  const { kind, id, action } = (await req.json().catch(() => ({}))) as {
    kind?: "node" | "edge";
    id?: number;
    action?: "approve" | "reject";
  };
  if (!id || (kind !== "node" && kind !== "edge") || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const status = action === "approve" ? "approved" : "rejected";

  if (kind === "node") {
    await sql`UPDATE nodes SET status = ${status} WHERE id = ${id}`;
  } else {
    await sql`UPDATE edges SET status = ${status} WHERE id = ${id}`;
  }
  return NextResponse.json({ ok: true });
}
