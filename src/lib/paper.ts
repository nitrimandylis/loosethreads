// Per-note physical variation: which paper stock, how crooked, where the pin
// went in. Derived from the note id so a note looks the same on every reload
// and for every visitor. The wall is canonical, not randomised per render.
//
// This used to be CSS :nth-of-type rules, which silently did nothing: React
// Flow wraps every note in its own div, so each .sticky-note was always the
// first of its type and every note came out identical.

export const PAPER_STOCKS = 5;

// Periods 5 / 7 / 4 are pairwise co-prime-ish, so stock, tilt and pin don't
// march in lockstep down a run of sequential ids.
const TILTS = [-2.4, 1.6, -0.9, 2.8, -1.8, 0.7, -3.1];
const PIN_SHIFTS = [0, -13, 9, -6];

export type Paper = {
  /** 0-based index into the paper stocks defined in globals.css */
  stock: number;
  /** degrees of rotation */
  tilt: number;
  /** px the pin sits left/right of centre */
  pinShift: number;
};

export function paperFor(id: number): Paper {
  const n = Math.abs(Math.trunc(id)) || 0;
  return {
    stock: n % PAPER_STOCKS,
    tilt: TILTS[n % TILTS.length],
    pinShift: PIN_SHIFTS[n % PIN_SHIFTS.length],
  };
}
