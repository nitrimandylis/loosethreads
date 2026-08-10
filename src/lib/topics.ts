// ponytail: curated topics as a const, not a DB table. Promote to a table when
// you want to manage them from the UI. Each topic owns a patch of one wall;
// new notes are auto-placed inside their topic's patch.
export type Topic = {
  id: string;
  label: string;
  cx: number;
  cy: number;
};

/**
 * Zone centres, in board px. These used to sit 1600 apart, which meant that at
 * any zoom where a note was readable the rest of the screen was empty cork:
 * six islands with a void between them, not a wall. They now sit shoulder to
 * shoulder, close enough that the whole thing reads as one board and notes
 * from neighbouring topics crowd each other at the seams.
 */
export const TOPICS: Topic[] = [
  { id: "politics", label: "Politics", cx: -620, cy: 0 },
  { id: "celebrities", label: "Celebrities", cx: 0, cy: 0 },
  { id: "tech", label: "Tech", cx: 620, cy: 0 },
  { id: "music", label: "Music", cx: -620, cy: 520 },
  { id: "local", label: "Local", cx: 0, cy: 520 },
  { id: "sports", label: "Sports", cx: 620, cy: 520 },
];

export const TOPIC_IDS = new Set(TOPICS.map((t) => t.id));

export function topicById(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

export type Point = { x: number; y: number };

export const SPREAD = 235; // half-width of a topic's patch, in board px
const CANDIDATES = 20;

/**
 * Pick a spot for a new note inside its topic patch.
 *
 * Purely random placement buries notes: the patch is 470x470 and a note is
 * about 200x150, so collisions start showing up within a handful of notes.
 * Nobody reviews placement before a note lands any more, and x,y is never
 * editable afterwards, so the board has to get this right on the first try.
 *
 * Generate a handful of candidates and keep whichever sits furthest from the
 * notes already there. Notes still overlap at the corners, which is what makes
 * it look like a wall rather than a database; what they never do is land
 * squarely on top of each other.
 *
 * `rand` is injectable so the choice can be tested without stubbing globals.
 */
export function placeInTopic(
  id: string,
  existing: Point[] = [],
  rand: () => number = Math.random
): Point {
  const t = topicById(id) ?? TOPICS[0];
  const draw = (): Point => ({
    x: Math.round(t.cx + (rand() * 2 - 1) * SPREAD),
    y: Math.round(t.cy + (rand() * 2 - 1) * SPREAD),
  });

  if (existing.length === 0) return draw();

  let best = draw();
  let bestGap = -1;
  for (let i = 0; i < CANDIDATES; i++) {
    const p = i === 0 ? best : draw();
    // squared distance is enough to compare; no need for the square root
    let gap = Infinity;
    for (const e of existing) {
      const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
      if (d < gap) gap = d;
    }
    if (gap > bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  return best;
}
