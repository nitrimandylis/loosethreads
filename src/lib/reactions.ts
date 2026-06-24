// Fixed, public stamp set for the gossip board. Reactions are not moderated.
export const STAMPS = ["CONFIRMED", "CAP", "👀", "LMAO"] as const;
export type Stamp = (typeof STAMPS)[number];

export function isStamp(v: unknown): v is Stamp {
  return typeof v === "string" && (STAMPS as readonly string[]).includes(v);
}
