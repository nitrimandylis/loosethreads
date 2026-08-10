import { NextResponse } from "next/server";
import { clearAdminCookie } from "@/lib/admin";

// The cookie is sha256(ADMIN_SECRET) with no server-side session, so this ends
// the session on THIS device only. A session you can't reach can still only be
// killed by rotating ADMIN_SECRET.
export async function POST() {
  await clearAdminCookie();
  return NextResponse.json({ ok: true });
}
