// Cloudflare Turnstile server-side verification.
// If TURNSTILE_SECRET_KEY is unset we skip verification, which is right for
// local dev and wrong in production now that submissions publish immediately:
// see requireGate() in the submit route, which refuses writes instead.
export const hasTurnstile = !!process.env.TURNSTILE_SECRET_KEY;

export async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  body.append("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
