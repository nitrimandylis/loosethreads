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

export type Placed = {
  id: number;
  body: string;
  x: number;
  y: number;
};

export type Box = { x: number; y: number; w: number; h: number };
export type Bounds = { x: number; y: number; w: number; h: number };

/** Empty wall around the outermost thing on it, in board px. */
const MARGIN = 130;

/**
 * Things pinned to the wall that are not notes, and never come down: the
 * wordmark on tape, the card explaining the place, a redacted photograph and a
 * torn piece of a map. They are part of the board rather than chrome floating
 * over it, which is what makes an empty wall still a wall.
 *
 * Positions are fixed, sized for a board of a dozen or so notes. A busier wall
 * grows out past them and starts crowding them, which is what happens to the
 * furniture on a real wall too.
 */
export const FURNITURE = {
  // Sizes are measured, not guessed: placement keeps notes off these boxes, so
  // a box smaller than what actually renders lets a note cover the rules card.
  header: { x: -300, y: -600, w: 602, h: 156 },
  rules: { x: -900, y: -300, w: 297, h: 310 },
  photo: { x: 690, y: -420, w: 249, h: 260 },
  map: { x: -840, y: 240, w: 307, h: 250 },
};

/** Corners of a prop, for tying string onto without crossing what it says. */
const corner = (
  f: { x: number; y: number; w: number; h: number },
  side: "tl" | "tr" | "bl" | "br"
) => ({
  x: side === "tl" || side === "bl" ? f.x + 22 : f.x + f.w - 22,
  y: side === "tl" || side === "tr" ? f.y + 8 : f.y + f.h - 8,
});

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
 * The whole wall, always including the furniture, so an empty board is a small
 * dressed corner of cork rather than a big blank rectangle.
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
 * String that was already on the wall before anybody pinned anything, running
 * between the props. Without it an empty board is a few objects on cork, and
 * the empty board is the state most strangers arrive to.
 */
export function furnitureStrings(): Array<[{ x: number; y: number }, { x: number; y: number }]> {
  const { header, rules, photo, map } = FURNITURE;
  // Tied corner to corner rather than pin to pin: string sags, and a run
  // between two pins at the top of each prop hangs straight across whatever
  // the prop says. The headings have to stay readable.
  return [
    [corner(rules, "tr"), corner(header, "bl")],
    [corner(header, "br"), corner(photo, "tl")],
    [corner(photo, "bl"), corner(map, "tr")],
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
 * Where to point the visitor when the wall does not fit: the middle of the
 * notes, so they land on gossip and string rather than on a quiet edge. With
 * nothing pinned up yet, the middle of the furniture instead.
 */
export function heartOf(notes: Placed[], fallback: Bounds): { x: number; y: number } {
  if (notes.length === 0) return { x: fallback.x + fallback.w / 2, y: fallback.y + fallback.h / 2 };

  const sum = notes.reduce(
    (acc, n) => {
      const b = noteBox(n);
      return { x: acc.x + b.x + b.w / 2, y: acc.y + b.y + b.h / 2 };
    },
    { x: 0, y: 0 }
  );
  return { x: sum.x / notes.length, y: sum.y / notes.length };
}

/** Frame around the wordmark and the rules card, for the establishing shot. */
const FRAME_MARGIN = 60;
export function furnitureFrame(): Bounds {
  const { header, rules } = FURNITURE;
  const minX = Math.min(header.x, rules.x);
  const minY = Math.min(header.y, rules.y);
  const maxX = Math.max(header.x + header.w, rules.x + rules.w);
  const maxY = Math.max(header.y + header.h, rules.y + rules.h);
  return {
    x: minX - FRAME_MARGIN,
    y: minY - FRAME_MARGIN,
    w: maxX - minX + FRAME_MARGIN * 2,
    h: maxY - minY + FRAME_MARGIN * 2,
  };
}

/**
 * What the establishing shot frames. The full furniture frame when it fits at
 * a scale where the rules card is still readable; on a narrow screen that
 * scale does not exist, so the shot frames the rules card alone and the
 * travel to the notes pans past the wordmark instead.
 */
const SHOT_READABLE = 0.55;
export function shotFrame(vw: number, vh: number): Bounds {
  const full = furnitureFrame();
  if (fitScale(full, vw, vh) >= SHOT_READABLE) return full;
  const { rules } = FURNITURE;
  return {
    x: rules.x - FRAME_MARGIN,
    y: rules.y - FRAME_MARGIN,
    w: rules.w + FRAME_MARGIN * 2,
    h: rules.h + FRAME_MARGIN * 2,
  };
}

/** True when the whole frame is on screen in the view (scale, focus). */
export function frameVisible(
  frame: Bounds,
  scale: number,
  focus: { x: number; y: number },
  vw: number,
  vh: number
): boolean {
  const halfW = vw / 2 / scale;
  const halfH = vh / 2 / scale;
  return (
    frame.x >= focus.x - halfW &&
    frame.x + frame.w <= focus.x + halfW &&
    frame.y >= focus.y - halfH &&
    frame.y + frame.h <= focus.y + halfH
  );
}

/** Free zoom never goes past 1:1 or further out than the survey scale. */
export function clampScale(s: number, survey: number): number {
  return Math.min(1, Math.max(survey, s));
}

/**
 * New scroll offset that keeps the board point currently under `pointer`
 * (a viewport offset in px) in the same place across a scale change.
 */
export function anchorScroll(scroll: number, pointer: number, from: number, to: number): number {
  return ((scroll + pointer) / from) * to - pointer;
}
