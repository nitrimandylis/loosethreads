// Pure age → visual bucket. Drives CSS only; no animation loop.
export function ageBucket(
  createdAtIso: string,
  now: number = Date.now()
): "fresh" | "days" | "weeks" | "old" {
  const ageMs = now - Date.parse(createdAtIso);
  const day = 86_400_000;
  if (ageMs < day) return "fresh";
  if (ageMs < 7 * day) return "days";
  if (ageMs < 30 * day) return "weeks";
  return "old";
}
