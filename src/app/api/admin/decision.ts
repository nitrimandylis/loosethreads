/** Pure helper — safe to import in Node test runner without Next.js. */
export function editedBody(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}
