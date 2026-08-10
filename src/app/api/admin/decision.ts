// Relative, not the "@/" alias: this module is imported directly by
// node --test, which has no tsconfig path mapping to resolve it with.
import { MAX_BODY } from "../../../lib/limits.ts";

/** Pure helpers, safe to import in the Node test runner without Next.js. */

/**
 * The edited body of a note, or null if there's nothing usable to write.
 * The public route caps length at MAX_BODY; the admin path used to skip that,
 * so the invariant the sticky card is laid out around held on one path only.
 */
export function editedBody(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t.length || t.length > MAX_BODY) return null;
  return t;
}

/** Row ids come off the wire as JSON, so "3", 3.5 and "abc" all have to go. */
export function rowId(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}
