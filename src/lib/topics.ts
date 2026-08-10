// ponytail: curated topics as a const, not a DB table. Promote to a table when
// you want to manage them from the UI. Each topic owns a region center on the
// infinite canvas; new notes are auto-placed near their topic's center.
export type Topic = {
  id: string;
  label: string;
  cx: number;
  cy: number;
};

export const TOPICS: Topic[] = [
  { id: "celebrities", label: "Celebrities", cx: 0, cy: 0 },
  { id: "tech", label: "Tech", cx: 1600, cy: 0 },
  { id: "politics", label: "Politics", cx: -1600, cy: 0 },
  { id: "local", label: "Local", cx: 0, cy: 1200 },
  { id: "sports", label: "Sports", cx: 1600, cy: 1200 },
  { id: "music", label: "Music", cx: -1600, cy: 1200 },
];

export const TOPIC_IDS = new Set(TOPICS.map((t) => t.id));

export function topicById(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

export type Point = { x: number; y: number };

const SPREAD = 550; // half-width of a topic's region, in board px
const CANDIDATES = 20;

/**
 * Pick a spot for a new note inside its topic region.
 *
 * Purely random placement buries notes: the region is 1100x1100 and a note is
 * about 210x150, so collisions start showing up around 8 notes in one topic.
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
