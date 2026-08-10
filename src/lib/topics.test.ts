import { test } from "node:test";
import assert from "node:assert/strict";
import { placeInTopic, topicById, SPREAD, type Point } from "./topics.ts";

const minGap = (p: Point, existing: Point[]) =>
  Math.min(...existing.map((e) => Math.hypot(p.x - e.x, p.y - e.y)));

// Deterministic stand-in for Math.random so the test isn't flaky.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

test("places inside the topic's patch", () => {
  const t = topicById("tech")!;
  for (let i = 0; i < 50; i++) {
    const p = placeInTopic("tech", [], seeded(i));
    assert.ok(Math.abs(p.x - t.cx) <= SPREAD, `x ${p.x} outside the patch`);
    assert.ok(Math.abs(p.y - t.cy) <= SPREAD, `y ${p.y} outside the patch`);
  }
});

test("keeps its distance from notes already on the board", () => {
  // One note dead centre. A picked spot should beat the average random one.
  const existing: Point[] = [{ x: 0, y: 0 }];
  const rand = seeded(7);
  const chosen = placeInTopic("celebrities", existing, rand);

  const naive: number[] = [];
  const r2 = seeded(7);
  for (let i = 0; i < 200; i++) {
    naive.push(
      minGap(
        { x: Math.round((r2() * 2 - 1) * SPREAD), y: Math.round((r2() * 2 - 1) * SPREAD) },
        existing
      )
    );
  }
  const average = naive.reduce((a, b) => a + b, 0) / naive.length;
  assert.ok(minGap(chosen, existing) > average, "picked spot is no better than random");
});

test("never lands squarely on top of an existing note", () => {
  // A note is about 200x150. Corners are meant to overlap on a packed wall;
  // what must never happen is one note landing squarely on another.
  const existing: Point[] = [];
  for (let i = 0; i < 12; i++) {
    const p = placeInTopic("local", existing, seeded(i * 31 + 5));
    if (existing.length) assert.ok(minGap(p, existing) > 80, `note ${i} buried at gap ${minGap(p, existing)}`);
    existing.push(p);
  }
});

test("falls back to a plain draw for the first note", () => {
  const p = placeInTopic("music", [], seeded(3));
  assert.equal(typeof p.x, "number");
  assert.equal(typeof p.y, "number");
});
