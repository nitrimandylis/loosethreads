import { test } from "node:test";
import assert from "node:assert/strict";
import { paperFor, PAPER_STOCKS } from "./paper.ts";

test("same id always gets the same paper", () => {
  assert.deepEqual(paperFor(42), paperFor(42));
});

test("stays in range for any id", () => {
  for (const id of [0, 1, 7, 12, 999, -5, 3.7]) {
    const p = paperFor(id);
    assert.ok(p.stock >= 0 && p.stock < PAPER_STOCKS, `stock ${p.stock}`);
    assert.ok(Math.abs(p.tilt) <= 4, `tilt ${p.tilt}`);
    assert.ok(Math.abs(p.pinShift) <= 20, `pinShift ${p.pinShift}`);
    assert.ok(p.width >= 140 && p.width <= 280, `width ${p.width}`);
  }
});

test("a long rumour gets a wider sheet", () => {
  assert.ok(paperFor(3, 400).width > paperFor(3, 20).width);
});

test("neighbouring notes never look the same", () => {
  // The whole point: sequential ids must not share a stock+tilt+pin combo.
  for (let id = 1; id < 60; id++) {
    assert.notDeepEqual(paperFor(id), paperFor(id + 1), `ids ${id} and ${id + 1} match`);
  }
});
