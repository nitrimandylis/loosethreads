import { NextResponse } from "next/server";
import { checkSecret, setAdminCookie } from "@/lib/admin";

export async function POST(req: Request) {
  const { secret } = (await req.json().catch(() => ({}))) as { secret?: string };
  if (!secret || !checkSecret(secret)) {
    return NextResponse.json({ error: "Wrong secret" }, { status: 401 });
  }
  await setAdminCookie();
  return NextResponse.json({ ok: true });
}
