import { createHash } from "node:crypto";
import { cookies } from "next/headers";

// ponytail: single-admin auth = compare a signed cookie to sha256(ADMIN_SECRET).
// No user table, no auth provider — there is exactly one admin (you). Swap for a
// real auth provider only if you ever add more than one moderator.
const COOKIE = "gossip_admin";

function token(): string | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return null;
  return createHash("sha256").update(secret).digest("hex");
}

export function checkSecret(input: string): boolean {
  return !!process.env.ADMIN_SECRET && input === process.env.ADMIN_SECRET;
}

export async function setAdminCookie(): Promise<void> {
  const t = token();
  if (!t) return;
  (await cookies()).set(COOKIE, t, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function isAdmin(): Promise<boolean> {
  const t = token();
  if (!t) return false;
  const c = (await cookies()).get(COOKIE)?.value;
  return c === t;
}
