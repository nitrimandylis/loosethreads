import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wallBounds,
  landingScale,
  steppedBackScale,
  fitScale,
  heartOf,
  pinOf,
  noteBox,
  stringPath,
  furnitureFrame,
  shotFrame,
  frameVisible,
  clampScale,
  anchorScroll,
  MIN_READABLE,
  readableFloor,
  type Placed,
} from "./wall.ts";

const note = (id: number, x: number, y: number, body = "a rumour"): Placed => ({ id, body, x, y });

test("an empty wall is still a wall", () => {
  // The props are furniture, so the bounds exist before any note does.
  const b = wallBounds([]);
  assert.ok(b.w > 1000 && b.h > 500, `${b.w}x${b.h}`);
});

test("an empty wall fits a laptop screen", () => {
  // It is the state most strangers arrive to, so it has to be one screenshot
  // rather than a corner of a much larger brown rectangle.
  assert.ok(fitScale(wallBounds([]), 1440, 900) > 0.6);
});

test("bounds swallow a note that sits outside every zone", () => {
  const b = wallBounds([note(1, 9000, 9000)]);
  assert.ok(b.x + b.w > 9000, "right edge");
  assert.ok(b.y + b.h > 9000, "bottom edge");
});

test("landing never drops below readable, stepping back may", () => {
  const b = wallBounds([]);
  const phone = { w: 390, h: 700 };
  const laptop = { w: 1440, h: 900 };
  assert.equal(landingScale(b, phone.w, phone.h), readableFloor(phone.w));
  assert.equal(landingScale(b, laptop.w, laptop.h), MIN_READABLE);
  assert.ok(steppedBackScale(b, phone.w, phone.h) < readableFloor(phone.w));
});

test("a phone gets a bigger floor than a laptop", () => {
  assert.ok(readableFloor(390) > readableFloor(1440));
});

test("landing never zooms past life size", () => {
  assert.equal(landingScale(wallBounds([]), 6000, 6000), 1);
});

test("an empty wall points at its own middle", () => {
  const b = wallBounds([]);
  const p = heartOf([], b);
  assert.equal(p.x, b.x + b.w / 2);
  assert.equal(p.y, b.y + b.h / 2);
});

test("the frame points at where the notes are", () => {
  const notes = [note(1, 900, 0), note(2, 950, 60), note(3, 880, 120), note(4, 920, 40)];
  const p = heartOf(notes, wallBounds(notes));
  assert.ok(p.x > 800, `x ${p.x}`);
  assert.ok(p.y > 0 && p.y < 400, `y ${p.y}`);
});

test("string stops short of both pins and hangs between them", () => {
  const d = stringPath({ x: 0, y: 0 }, { x: 400, y: 0 });
  const [x1, y1, cx, cy, x2] = d.replace(/[MQ]/g, "").trim().split(/\s+/);
  assert.ok(Number(x1) > 0 && Number(x2) < 400, `trimmed: ${d}`);
  assert.equal(Number(y1), 0);
  assert.equal(Number(cx), 200);
  assert.ok(Number(cy) > 0, `control point should hang below: ${cy}`);
});

test("a short string barely sags, a long one droops", () => {
  const sagOf = (span: number) => {
    const parts = stringPath({ x: 0, y: 0 }, { x: span, y: 0 }).split(/\s+/);
    return Number(parts[5]); // control y
  };
  assert.ok(sagOf(60) < sagOf(1200), "long spans hang further");
});

test("the pin sits at the top of the sheet, near the middle", () => {
  const n = note(3, 100, 200);
  const box = noteBox(n);
  const pin = pinOf(n);
  assert.ok(Math.abs(pin.x - (box.x + box.w / 2)) <= 20, `pin x ${pin.x}`);
  assert.ok(pin.y <= box.y, `pin y ${pin.y}`);
});

test("furnitureFrame covers the header and the rules card", () => {
  const f = furnitureFrame();
  // header spans x -300..302, rules x -900..-603; frame adds 60 margin
  assert.equal(f.x, -960);
  assert.equal(f.y, -660); // header top -600 minus margin
  assert.ok(f.x + f.w >= 302 + 60);
  assert.ok(f.y + f.h >= 10 + 60); // rules bottom is -300+310=10
});

test("the shot frames everything on a laptop, just the rules on a phone", () => {
  const full = furnitureFrame();
  assert.deepEqual(shotFrame(1440, 900), full);
  const phone = shotFrame(390, 844);
  assert.ok(phone.w < full.w, "phone frame is the rules card only");
  // and the rules card is actually readable in it
  assert.ok(fitScale(phone, 390, 844) > 0.8, `${fitScale(phone, 390, 844)}`);
});

test("frameVisible is true only when the whole frame fits the view", () => {
  const frame = { x: 0, y: 0, w: 100, h: 100 };
  // viewport 400x400 at scale 1 centred on the frame centre: fits
  assert.equal(frameVisible(frame, 1, { x: 50, y: 50 }, 400, 400), true);
  // centred far away: does not fit
  assert.equal(frameVisible(frame, 1, { x: 1000, y: 50 }, 400, 400), false);
  // viewport smaller than the frame at this scale: does not fit
  assert.equal(frameVisible(frame, 1, { x: 50, y: 50 }, 80, 400), false);
});

test("clampScale stays inside survey..1", () => {
  assert.equal(clampScale(0.05, 0.2), 0.2);
  assert.equal(clampScale(3, 0.2), 1);
  assert.equal(clampScale(0.5, 0.2), 0.5);
});

test("anchorScroll keeps the point under the pointer fixed", () => {
  // content offset (scroll+pointer) is 300 at scale 1 -> board point 300.
  // at scale 2 that point sits at content 600; pointer still at 100 -> scroll 500.
  assert.equal(anchorScroll(200, 100, 1, 2), 500);
  // identity: same scale, same scroll
  assert.equal(anchorScroll(200, 100, 1, 1), 200);
});
