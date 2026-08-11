// A fixed board for looking at the design without a database behind it.
// Reachable only in development, at /?demo=1. Same five rumours as the link
// preview image, so what you see here is what gets pasted into a group chat.

import type { NoteRow, EdgeRow } from "./queries.ts";
import { place, seeded, type Point } from "./placement.ts";
import { FURNITURE } from "./wall.ts";

const AGES = [2, 90, 800, 26, 300]; // hours old, to show the aging ramp

const BODIES = [
  "the one from the band was at the airport with someone who was very much not his girlfriend",
  "if you line up the dates, there is only one conclusion available to a reasonable person",
  "the demo was pre-recorded and everyone in that room knew",
  "she has never once paid for her own coffee and I have receipts",
  "they are not brothers",
];

const REACTIONS: Record<string, number>[] = [
  { CONFIRMED: 3, "👀": 7 },
  { "👀": 21 },
  { CONFIRMED: 12 },
  { LMAO: 4 },
  { CAP: 6 },
];

export function demoBoard(): { notes: NoteRow[]; edges: EdgeRow[] } {
  const hour = 3_600_000;
  // Fixed clock so the aging buckets are stable between runs and screenshots.
  const now = Date.parse("2026-08-10T12:00:00Z");

  // Placed by the real placer, so the demo board is laid out exactly the way a
  // real one would be.
  const rand = seeded(9);
  const spots: Point[] = [];
  for (let i = 0; i < BODIES.length; i++) spots.push(place(spots, Object.values(FURNITURE), rand));

  const notes: NoteRow[] = BODIES.map((body, i) => ({
    id: i + 1,
    body,
    x: spots[i].x,
    y: spots[i].y,
    created_at: new Date(now - AGES[i] * hour).toISOString(),
    reactions: REACTIONS[i],
  }));

  const edges: EdgeRow[] = [
    { id: 1, source_id: 1, target_id: 2 },
    { id: 2, source_id: 2, target_id: 3 },
    { id: 3, source_id: 1, target_id: 4 },
    { id: 4, source_id: 4, target_id: 3 },
    { id: 5, source_id: 5, target_id: 4 },
  ];

  return { notes, edges };
}
