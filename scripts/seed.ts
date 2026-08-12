/**
 * The demo board, in one file.
 *
 * `npm run seed` wipes the local pglite database and rebuilds it from the
 * story below: sixteen notes about one night, the string tying them together,
 * and the stamps people left on them. The database itself is gitignored, so
 * this script is the only copy that survives; anybody can regenerate the exact
 * same wall, which is what makes the README screenshot re-shootable after the
 * design moves.
 *
 * It is not a fixture for tests and nothing in the app imports it. It writes
 * through the same `sql` the app uses, so the seeded board is a real board:
 * you can drag it, tie it, stamp it and take things down from it.
 */

// Set before importing db.ts, which reads DATABASE_URL the first time a query
// runs. Seeding a cloud database from a script is not a thing anyone wants.
process.env.DATABASE_URL = "pglite:.pgdata";

import { sql, ensureSchema } from "../src/lib/db.ts";
import { place, seeded, type Point } from "../src/lib/placement.ts";
import { FURNITURE } from "../src/lib/wall.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * One evening, reconstructed by people who were not all in the room.
 *
 * Ordered oldest first, because ids come off a sequence and a real board's ids
 * ascend with time. That ordering does the storytelling on its own: paper
 * yellows with age, so the oldest notes (the raw sightings) are the faded ones
 * and the conclusion, pinned two hours ago, is the brightest sheet on the wall.
 *
 * `age` is relative to whenever this runs, never absolute. Absolute dates would
 * drift every note into the `old` bucket within a month and the screenshot
 * would stop being reproducible.
 */
const NOTES: { body: string; age: number }[] = [
  // --- old: the raw sightings, 30d+ , fully yellowed ---
  { body: "nobody can account for the hour between eleven and midnight", age: 68 * DAY },
  { body: "they left separately and arrived at the same place four minutes apart", age: 61 * DAY },
  { body: "everyone agreed not to mention the second table", age: 52 * DAY },
  { body: "the photo was taken eleven months before he says it was", age: 43 * DAY },

  // --- weeks: the paperwork ---
  { body: "somebody paid for the taxi and it was neither of them", age: 24 * DAY },
  { body: "there is a receipt with both names on it and nobody will explain it", age: 19 * DAY },
  { body: "two people cancelled the same evening with the same excuse", age: 13 * DAY },
  { body: "he still has a key", age: 9 * DAY },

  // --- days: people starting to connect things ---
  { body: "the taxi was booked from a phone that was supposedly off", age: 6 * DAY },
  { body: "the message was deleted but not from every phone", age: 4 * DAY },
  { body: "the deposit went out on a tuesday and the booking was cancelled on the monday", age: 3 * DAY },
  { body: "she knew before anyone told her", age: 2 * DAY },

  // --- fresh: today, still bright ---
  { body: "somebody in this group has been to the flat and will not say when", age: 20 * HOUR },
  { body: "the account posting about it was made the week before", age: 9 * HOUR },
  { body: "they are not brothers", age: 5 * HOUR },
  { body: "if you line up the dates there is only one conclusion available to a reasonable person", age: 2 * HOUR },
];

/**
 * String, by note number above.
 *
 * Three chains of evidence run through it: the timeline (1-2-9), the money
 * (5-6-11) and the cover (3-7-10). All three terminate on note 4, the
 * photograph that cannot be from when he says, and 4 ties on to 16, the
 * conclusion. The rest are the cross-links people tied while arguing, which is
 * what turns three tidy chains into a wall.
 *
 * 13 and 14 carry no string at all. They went up today and nobody has got to
 * them yet, which is what most notes on a real board look like.
 */
const STRINGS: [number, number][] = [
  [1, 2], [2, 9],            // the timeline
  [5, 6], [6, 11],           // the money
  [3, 7], [7, 10],           // the cover
  [9, 4], [11, 4], [10, 4],  // all three meet at the photograph
  [4, 16],                   // and the photograph implies the conclusion
  [1, 5], [2, 10], [2, 8], [10, 12], [4, 15],
  [6, 8], [1, 16], [11, 7], [1, 3], [9, 10],
];

/**
 * Stamps, by note number. The board argues with itself on purpose: the
 * conclusion is heavily CONFIRMED, the wildest claim is heavily CAP, and the
 * photograph is split down the middle. Nine of the sixteen carry nothing,
 * which keeps a stamp reading as a mark somebody made rather than a score
 * printed under every post.
 */
const STAMPS: Record<number, Record<string, number>> = {
  3: { LMAO: 2 },
  4: { CONFIRMED: 6, CAP: 6 },
  5: { LMAO: 5 },
  8: { "👀": 11 },
  10: { "👀": 4 },
  15: { CAP: 9, "👀": 3 },
  16: { CONFIRMED: 14 },
};

async function seed(): Promise<boolean> {
  await ensureSchema();

  // The TRUNCATE below is not scoped to the public wall, and cannot be: the
  // ids have to come back as 1..16, which is only true if nothing else is in
  // the table. So a seed takes every private board's notes with it, which is
  // worth refusing rather than mentioning. --force says you meant it.
  const occupied = (await sql`
    SELECT b.slug, count(n.id)::int AS notes
    FROM boards b JOIN nodes n ON n.board_id = b.id
    WHERE b.slug <> '' AND n.status = 'approved'
    GROUP BY b.slug ORDER BY b.slug
  `) as { slug: string; notes: number }[];

  if (occupied.length && !process.argv.includes("--force")) {
    console.error("[!] seeding empties every board, not just the public one.");
    for (const b of occupied) console.error(`    /b/${b.slug} would lose ${b.notes} notes`);
    console.error("[!] nothing was written. re-run with --force if that is what you want.");
    // exitCode, never process.exit: exiting here would skip the close at the
    // bottom of this file and leave pglite's lock file behind, so the next run
    // against this folder hangs waiting for a process that is already gone.
    process.exitCode = 1;
    return false;
  }

  // RESTART IDENTITY so the notes come back as ids 1..16 on every run: paper
  // stock, tilt and pin position are all derived from the id, so without it
  // the same story would be printed on different paper each time and the
  // screenshot would never match the last one.
  await sql`TRUNCATE nodes, edges, reactions RESTART IDENTITY CASCADE`;

  // Laid out by the real placer, from a fixed seed. Nothing here is
  // hand-positioned: the wall in the screenshot is a wall the software can
  // actually produce, spacing, overlaps and all.
  //
  // The seed is arbitrary, so it was picked rather than left to chance: 4 puts
  // three notes over a corner of a neighbour, none by more than about 30x29px.
  // Notes that never touch read as a database, and notes that overlap by more
  // than a corner bury each other's text. Both are one number away.
  const rand = seeded(4);
  const spots: Point[] = [];
  const now = Date.now();

  // Named explicitly rather than left to the backfill in ensureSchema. That
  // backfill exists to sweep up rows written before boards existed, and a
  // seeded note that only reaches the public wall because a migration happened
  // to run afterwards is a note on no board until it does.
  const [publicBoard] = (await sql`SELECT id FROM boards WHERE slug = ''`) as { id: number }[];

  for (const note of NOTES) {
    const spot = place(spots, Object.values(FURNITURE), rand);
    spots.push(spot);
    await sql`
      INSERT INTO nodes (body, x, y, status, created_at, board_id)
      VALUES (
        ${note.body}, ${spot.x}, ${spot.y}, 'approved',
        ${new Date(now - note.age).toISOString()}, ${publicBoard.id}
      )
    `;
  }

  for (const [a, b] of STRINGS) {
    await sql`
      INSERT INTO edges (source_id, target_id, status) VALUES (${a}, ${b}, 'approved')
    `;
  }

  for (const [id, marks] of Object.entries(STAMPS)) {
    for (const [kind, count] of Object.entries(marks)) {
      // One row per stamp, because that is what the board counts: the public
      // read aggregates reactions with count(*), not a stored total.
      for (let i = 0; i < count; i++) {
        await sql`INSERT INTO reactions (node_id, kind) VALUES (${Number(id)}, ${kind})`;
      }
    }
  }

  return true;
}

/**
 * Read the board back and check it came out whole. A seed that half-worked
 * looks like a design problem in the screenshot, and that is an expensive way
 * to find a missing row.
 *
 * Counted with the same joins the public read uses (queries.ts), rather than
 * against the constants above: a string whose endpoint is missing, or a stamp
 * on a note that is not there, disappears from the board silently, and only a
 * query that joins the way the board does will notice.
 */
async function verify() {
  const [live] = (await sql`
    SELECT
      (SELECT count(*)::int FROM nodes WHERE status = 'approved') AS notes,
      (SELECT count(*)::int FROM edges e
         JOIN nodes s ON s.id = e.source_id AND s.status = 'approved'
         JOIN nodes t ON t.id = e.target_id AND t.status = 'approved'
        WHERE e.status = 'approved') AS strings,
      (SELECT count(*)::int FROM reactions r
         JOIN nodes n ON n.id = r.node_id AND n.status = 'approved') AS stamps,
      (SELECT count(DISTINCT r.node_id)::int FROM reactions r
         JOIN nodes n ON n.id = r.node_id AND n.status = 'approved') AS stamped
  `) as { notes: number; strings: number; stamps: number; stamped: number }[];

  const wanted = Object.values(STAMPS)
    .flatMap((m) => Object.values(m))
    .reduce((a, b) => a + b, 0);
  const tied = new Set(STRINGS.flat()).size;

  const checks: [string, boolean][] = [
    [`${live.notes} notes`, live.notes === NOTES.length],
    [`${live.strings} strings, both ends live`, live.strings === STRINGS.length],
    [`${live.stamps} stamps on ${live.stamped} notes`,
      live.stamps === wanted && live.stamped === Object.keys(STAMPS).length],
    [`${NOTES.length - tied} notes left untied`, tied < NOTES.length],
    // The whole point of the age spread is that all four paper treatments are
    // on the wall at once.
    ["all four age buckets present", new Set(NOTES.map(bucket)).size === 4],
  ];

  for (const [label, ok] of checks) {
    console.log(`${ok ? "[✓]" : "[✗]"} ${label}`);
    if (!ok) process.exitCode = 1;
  }
}

const bucket = (n: { age: number }) =>
  n.age < DAY ? "fresh" : n.age < 7 * DAY ? "days" : n.age < 30 * DAY ? "weeks" : "old";

// verify() reads back what seed() wrote; there is nothing to read if it
// refused, and its checks would all fail on the board it declined to touch.
if (await seed()) await verify();

// pglite holds the database in memory and flushes to the folder; without an
// explicit close the process can exit before the last write lands on disk.
// db.ts parks the instance on globalThis, which is the only handle there is.
const held = (globalThis as { __localDb?: Promise<{ close?: () => Promise<void> }> }).__localDb;
await (await held)?.close?.();
