// Per-note physical variation: which paper it got torn off, how crooked it
// went up, where the pin went in, how wide the sheet is. All derived from the
// note id so a note looks the same on every reload and for every visitor. The
// wall is canonical, not randomised per render.
//
// This used to be CSS :nth-of-type rules, which silently did nothing: every
// note was wrapped in its own div, so each one was always the first of its
// type and the whole board came out identical.

export const PAPER_STOCKS = 5;

// Periods 5 / 7 / 4 are pairwise co-prime-ish, so stock, tilt and pin don't
// march in lockstep down a run of sequential ids.
const TILTS = [-2.4, 1.6, -0.9, 2.8, -1.8, 0.7, -3.1];
const PIN_SHIFTS = [0, -13, 9, -6];

/**
 * Base width per stock, in board px. These are five different objects, not one
 * card in five colours: a legal sheet is wide, a receipt is a thin strip. The
 * silhouette is what stops the wall reading as a grid of components, so the
 * widths have to actually differ.
 *
 *   0 legal pad · 1 manila card · 2 memo · 3 message slip · 4 receipt
 */
const WIDTHS = [232, 198, 214, 186, 152];

/** A rumour that runs long gets a bigger sheet rather than a taller sliver. */
const LONG_BODY = 190;
const LONG_BONUS = 34;

export type Paper = {
  /** 0-based index into the paper stocks defined in globals.css */
  stock: number;
  /** degrees of rotation */
  tilt: number;
  /** px the pin sits left/right of centre */
  pinShift: number;
  /** px wide, before any transform */
  width: number;
};

export function paperFor(id: number, bodyLength = 0): Paper {
  const n = Math.abs(Math.trunc(id)) || 0;
  const stock = n % PAPER_STOCKS;
  return {
    stock,
    tilt: TILTS[n % TILTS.length],
    pinShift: PIN_SHIFTS[n % PIN_SHIFTS.length],
    width: WIDTHS[stock] + (bodyLength > LONG_BODY ? LONG_BONUS : 0),
  };
}
