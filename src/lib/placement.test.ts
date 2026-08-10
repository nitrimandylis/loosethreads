import { test } from "node:test";
import assert from "node:assert/strict";
import { place, wallRadius, type Box, type Point } from "./placement.ts";

// Deterministic stand-in for Math.random so the tests aren't flaky.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const minGap = (p: Point, existing: Point[]) =>
  Math.min(...existing.map((e) => Math.hypot(p.x - e.x, p.y - e.y)));

/** Fills a board the way the submit route does: one note at a time. */
function fill(count: number, seed = 11, blocked: Box[] = []): Point[] {
  const rand = seeded(seed);
  const notes: Point[] = [];
  for (let i = 0; i < count; i++) notes.push(place(notes, blocked, rand));
  return notes;
}

test("the first note goes dead centre", () => {
  assert.deepEqual(place([]), { x: 0, y: 0 });
});

test("notes keep off the furniture", () => {
  // The props carry the title and the rules; a note on top of one hides both.
  const prop: Box = { x: -420, y: -260, w: 300, h: 260 };
  for (const p of fill(40, 5, [prop])) {
    const overlaps =
      p.x < prop.x + prop.w && p.x + 250 > prop.x && p.y < prop.y + prop.h && p.y + 200 > prop.y;
    assert.ok(!overlaps, `note at ${p.x},${p.y} landed on the prop`);
  }
});

test("nothing lands squarely on top of anything", () => {
  // A note is about 200x150. Corners are meant to overlap on a packed wall;
  // what must never happen is one note burying another.
  const notes = fill(60);
  for (let i = 1; i < notes.length; i++) {
    const gap = minGap(notes[i], notes.slice(0, i));
    assert.ok(gap > 60, `note ${i} landed ${Math.round(gap)}px from its neighbour`);
  }
});

test("the wall grows with what is on it", () => {
  const far = (notes: Point[]) => Math.max(...notes.map((p) => Math.hypot(p.x, p.y)));
  assert.ok(far(fill(60)) > far(fill(6)), "a busy board should reach further out");
});

test("density holds as the board fills", () => {
  // Notes per unit area should not drift as the wall grows, or a big board
  // turns into either a smear or a scatter.
  const density = (n: number) => {
    const r = wallRadius(n);
    return n / (Math.PI * r.x * r.y);
  };
  const small = density(8);
  const large = density(200);
  assert.ok(Math.abs(small - large) / small < 0.01, `${small} vs ${large}`);
});

test("the wall is wider than it is tall", () => {
  const r = wallRadius(40);
  assert.ok(r.x > r.y, `${r.x} x ${r.y}`);
});

test("same seed, same board", () => {
  assert.deepEqual(fill(10, 3), fill(10, 3));
});
