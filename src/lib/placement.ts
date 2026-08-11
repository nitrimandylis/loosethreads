// Where a new note goes on a wall with no sections.
//
// The board used to be six fixed patches, one per topic, which meant most of
// it was empty cork most of the time and a busy topic had nowhere to grow.
// There is one wall now, and it grows with what is on it.

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

/** Roughly a note, for keeping clear of things. Paper widths vary; this is the
 * generous case, plus a margin so nothing lands half on top of a prop. */
const NOTE = { w: 250, h: 200 };

/**
 * Spread constant, in board px.
 *
 * The wall is an ellipse whose radius grows as the square root of the note
 * count, because area grows as the square of the radius: √n keeps
 * notes-per-area identical whether there are five notes on the board or three
 * hundred. Picked so a note (about 200x150) covers roughly a quarter of its
 * share of the wall, which is dense enough that notes crowd and overlap at the
 * corners without burying each other.
 */
const SPREAD = 195;

/** Wider than it is tall, because a screenshot is landscape. */
const ASPECT = 1.35;

const CANDIDATES = 20;

/**
 * Pick a spot for a new note.
 *
 * Generate a handful of candidates inside the current wall, throw away any that
 * would land on the furniture, and keep whichever of the rest sits furthest
 * from everything already pinned up. Notes still overlap at the
 * corners, which is what makes it look like a wall rather than a database;
 * what they never do is land squarely on top of each other.
 *
 * `rand` is injectable so the choice can be tested without stubbing globals.
 */
export function place(
  existing: Point[] = [],
  blocked: Box[] = [],
  rand: () => number = Math.random
): Point {
  const clear = (p: Point) =>
    !blocked.some(
      (b) =>
        p.x < b.x + b.w && p.x + NOTE.w > b.x && p.y < b.y + b.h && p.y + NOTE.h > b.y
    );

  if (existing.length === 0) return clear({ x: 0, y: 0 }) ? { x: 0, y: 0 } : { x: 0, y: 120 };

  const r = SPREAD * Math.sqrt(existing.length);
  const draw = (): Point => {
    const angle = rand() * Math.PI * 2;
    // sqrt of a uniform draw spreads points evenly over the area rather than
    // bunching them in the middle
    const d = Math.sqrt(rand());
    return {
      x: Math.round(Math.cos(angle) * d * r * ASPECT),
      y: Math.round(Math.sin(angle) * d * (r / ASPECT)),
    };
  };

  let best: Point | null = null;
  let bestGap = -1;
  let fallback = draw();

  for (let i = 0; i < CANDIDATES; i++) {
    const p = draw();
    // squared distance is enough to compare; no need for the square root
    let gap = Infinity;
    for (const e of existing) {
      const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
      if (d < gap) gap = d;
    }
    // A spot on top of the wordmark or the rules card is not a spot: the props
    // are what a stranger reads first, and a note over them is unreadable too.
    if (!clear(p)) continue;
    if (gap > bestGap) {
      bestGap = gap;
      best = p;
      fallback = p;
    }
  }
  // Every candidate landed on furniture (a very crowded wall). Take one anyway
  // rather than refusing to place the note.
  return best ?? fallback;
}

/**
 * A stand-in for Math.random that always deals the same hand. Anything that
 * has to lay out the same wall twice, the demo board and the seed script,
 * passes one of these to place() instead of leaving it to chance.
 */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** How far out the wall reaches for a given number of notes, for layout. */
export function wallRadius(count: number): { x: number; y: number } {
  const r = SPREAD * Math.sqrt(Math.max(count, 1));
  return { x: r * ASPECT, y: r / ASPECT };
}
