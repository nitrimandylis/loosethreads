import { NextResponse } from "next/server";
import { checkSecret, setAdminCookie } from "@/lib/admin";
import { allowLogin } from "@/lib/ratelimit";

export async function POST(req: Request) {
  if (!(await allowLogin(req))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const { secret } = (await req.json().catch(() => ({}))) as { secret?: string };
  if (!secret || !checkSecret(secret)) {
    return NextResponse.json({ error: "Wrong secret" }, { status: 401 });
  }
  await setAdminCookie();
  return NextResponse.json({ ok: true });
}
