// Where everything sits on the wall, and how much of it fits on a screen.
//
// Pure functions, no DOM: the board is laid out from stored coordinates and
// the deterministic paper width, never from measured elements. That matters
// for two reasons. Strings tie pin to pin, and a pin is a fixed offset from a
// note's top edge, so the string layer can draw before a single note has been
// measured and never has to redraw when the handwriting font finally loads.

// .ts extensions on purpose: node --test strips types but does not resolve
// extensionless specifiers, and wall.ts is the first lib file another lib file
// imports. tsconfig has allowImportingTsExtensions for exactly this.
import { paperFor } from "./paper.ts";
import { TOPICS, SPREAD } from "./topics.ts";

export type Placed = {
  id: number;
  topic: string;
  body: string;
  x: number;
  y: number;
};

export type Box = { x: number; y: number; w: number; h: number };
export type Bounds = { x: number; y: number; w: number; h: number };

/** Empty wall around the outermost thing on it, in board px. */
const MARGIN = 130;

/** Zone labels are stuck on masking tape above their patch. */
export const LABEL_OFFSET = SPREAD + 74;

/**
 * Things pinned to the wall that are not notes: the wordmark on tape and the
 * index card explaining the place. They are part of the board rather than
 * chrome floating over it, which is what makes an empty wall still a wall, and
 * they are laid out in board coordinates so the bounds have to know about them.
 */
export const FURNITURE = {
  header: { x: -300, y: -LABEL_OFFSET - 250, w: 600, h: 170 },
  rules: { x: -690, y: -LABEL_OFFSET - 300, w: 290, h: 270 },
};

/**
 * Height a note will end up, near enough. Only bounds and the fit calculation
 * use this, and both want a generous answer: overestimating leaves a little
 * extra cork at the bottom, underestimating clips a note off the screen.
 */
export function noteHeight(body: string, width: number): number {
  const perLine = Math.max(8, Math.floor(width / 8.4));
  const lines = Math.max(1, Math.ceil(body.length / perLine));
  return Math.min(430, 74 + lines * 24);
}

export function noteBox(n: Placed): Box {
  const { width } = paperFor(n.id, n.body.length);
  return { x: n.x, y: n.y, w: width, h: noteHeight(n.body, width) };
}

/** Where the string ties on: the pushpin at the top of the sheet. */
export function pinOf(n: Placed): { x: number; y: number } {
  const { width, pinShift } = paperFor(n.id, n.body.length);
  return { x: n.x + width / 2 + pinShift, y: n.y - 2 };
}

/**
 * The whole wall, always including every zone label. The labels are part of
 * the furniture, so an empty board is still a wall with six taped headings on
 * it rather than a blank brown rectangle.
 */
export function wallBounds(notes: Placed[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const swallow = (x: number, y: number, w: number, h: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  };

  for (const t of TOPICS) {
    swallow(t.cx - SPREAD, t.cy - LABEL_OFFSET, SPREAD * 2, LABEL_OFFSET + SPREAD);
  }
  for (const f of Object.values(FURNITURE)) {
    swallow(f.x, f.y, f.w, f.h);
  }
  for (const n of notes) {
    const b = noteBox(n);
    swallow(b.x, b.y, b.w, b.h);
  }

  return {
    x: minX - MARGIN,
    y: minY - MARGIN,
    w: maxX - minX + MARGIN * 2,
    h: maxY - minY + MARGIN * 2,
  };
}

/** Scale at which the whole wall fits the viewport, ignoring legibility. */
export function fitScale(bounds: Bounds, vw: number, vh: number): number {
  if (bounds.w <= 0 || bounds.h <= 0) return 1;
  return Math.min(vw / bounds.w, vh / bounds.h, 1);
}

/**
 * Below this, handwriting on a note stops being handwriting and starts being
 * texture. The board never lands there on its own; only stepping back does.
 */
const MIN_READABLE_WIDE = 0.68;
const MIN_READABLE_PHONE = 0.85;

/**
 * A phone is held closer but shows far less wall, and the same scale that
 * reads fine on a laptop turns handwriting into texture on a 390px screen.
 */
export const readableFloor = (vw: number) => (vw < 640 ? MIN_READABLE_PHONE : MIN_READABLE_WIDE);

/** Kept for tests and callers that just want the desktop floor. */
export const MIN_READABLE = MIN_READABLE_WIDE;
export const MIN_WIDE = 0.14;

/**
 * What the visitor lands on: the widest view of the wall that still leaves the
 * notes readable. If the wall is too big to fit at that scale, they get the
 * readable floor and we scroll them to the busiest part of it instead.
 */
export function landingScale(bounds: Bounds, vw: number, vh: number): number {
  return Math.max(readableFloor(vw), fitScale(bounds, vw, vh));
}

/** Stepping back is allowed to go past readable. That is the point of it. */
export function steppedBackScale(bounds: Bounds, vw: number, vh: number): number {
  return Math.max(MIN_WIDE, fitScale(bounds, vw, vh));
}

/**
 * String that was already on the wall before anybody pinned anything: it runs
 * between the zone headings, not between rumours. Without it an empty board is
 * six labels on brown cork, and the empty board is the state most strangers
 * arrive to.
 */
export function furnitureStrings(): Array<[{ x: number; y: number }, { x: number; y: number }]> {
  const at = (id: string) => {
    const t = TOPICS.find((z) => z.id === id) ?? TOPICS[0];
    // Just under the tape, not through it: string across a heading reads as a
    // strikethrough and the headings have to stay readable.
    return { x: t.cx, y: t.cy - LABEL_OFFSET + 52 };
  };
  return [
    [at("politics"), at("celebrities")],
    [at("celebrities"), at("tech")],
    [at("music"), at("sports")],
  ];
}

/** How far short of the pin the string stops, so the pin head stays visible. */
const TRIM = 8;
/** A long run of yarn droops; a short one between two close pins stays taut. */
const SAG = 0.075;
const MAX_SAG = 62;

/**
 * One length of red string, pin to pin, as an SVG path.
 *
 * It sags. A straight line between two points is what every node editor draws,
 * and it is the single clearest tell that a wall was rendered rather than
 * strung by hand. The droop is proportional to the span, so string across the
 * board hangs and string between two neighbours barely bends.
 */
export function stringPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  // Stop short of both pins rather than running under them.
  const trim = Math.min(TRIM, len / 3);
  const x1 = a.x + ux * trim;
  const y1 = a.y + uy * trim;
  const x2 = b.x - ux * trim;
  const y2 = b.y - uy * trim;

  const sag = Math.min(MAX_SAG, len * SAG);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 + sag * 2; // quadratic control sits twice the sag

  return `M ${r(x1)} ${r(y1)} Q ${r(cx)} ${r(cy)} ${r(x2)} ${r(y2)}`;
}

const r = (n: number) => Math.round(n * 10) / 10;

/**
 * Where to point the visitor when the wall does not fit: the centre of gravity
 * of the busiest zone, so they land on notes and string rather than on the
 * quiet corner of an empty patch.
 */
export function busiestPoint(notes: Placed[], fallback: Bounds): { x: number; y: number } {
  if (notes.length === 0) return { x: fallback.x + fallback.w / 2, y: fallback.y + fallback.h / 2 };

  const counts = new Map<string, number>();
  for (const n of notes) counts.set(n.topic, (counts.get(n.topic) ?? 0) + 1);

  let top = notes[0].topic;
  for (const [topic, count] of counts) {
    if (count > (counts.get(top) ?? 0)) top = topic;
  }

  const inZone = notes.filter((n) => n.topic === top);
  const sum = inZone.reduce(
    (acc, n) => {
      const b = noteBox(n);
      return { x: acc.x + b.x + b.w / 2, y: acc.y + b.y + b.h / 2 };
    },
    { x: 0, y: 0 }
  );
  return { x: sum.x / inZone.length, y: sum.y / inZone.length };
}
