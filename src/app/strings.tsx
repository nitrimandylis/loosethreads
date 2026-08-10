"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { animate, svg } from "animejs";
import { stringPath, furnitureStrings } from "@/lib/wall";
import { edgeSecret } from "@/lib/mine";
import type { EdgeRow } from "@/lib/queries";

type Pin = { x: number; y: number };

/** Furniture string is part of the wall, so it never animates in. */
const never = () => false;

/**
 * The red string, drawn over the paper and stopping just short of each pin.
 *
 * The whole layer is derived from stored coordinates and the deterministic
 * paper width, so it never waits on a measured element and never has to redraw
 * when the handwriting font arrives.
 */
export function Strings({
  edges,
  pins,
  width,
  height,
  originX,
  originY,
  shouldDraw,
  onPickString,
}: {
  edges: EdgeRow[];
  pins: Map<number, Pin>;
  width: number;
  height: number;
  /** Top-left of the wall in board coordinates, for the furniture string. */
  originX: number;
  originY: number;
  /** Called when a string mounts: true once the board has painted at least once. */
  shouldDraw: () => boolean;
  /** Tapping a string this browser tied picks it (to untie). */
  onPickString: (id: number) => void;
}) {
  // Ownership lives in localStorage, which the server render cannot see, so
  // the first client render must match it: hit paths only mount after
  // hydration. The store trick gives false on the server and during
  // hydration, true on every client render after.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  return (
    <svg className="strings" width={width} height={height} aria-hidden="true">
      {/* Wall dressing: string between the headings, there before anyone
          pinned anything. Offset into wall coordinates like everything else. */}
      {furnitureStrings().map(([a, b], i) => (
        <Yarn
          key={`furniture-${i}`}
          d={stringPath({ x: a.x - originX, y: a.y - originY }, { x: b.x - originX, y: b.y - originY })}
          shouldDraw={never}
        />
      ))}
      {edges.map((e) => {
        const a = pins.get(e.source_id);
        const b = pins.get(e.target_id);
        if (!a || !b) return null; // an end came down; so does the string
        const d = stringPath(a, b);
        // Only string this browser tied gets a click surface: the wall must
        // not grow a click surface it mostly cannot honour. The window check
        // keeps the server render (which has no localStorage) matching the
        // first client render; the hit path arrives after hydration.
        const own = hydrated && edgeSecret(e.id) !== null;
        return (
          <g key={e.id}>
            <Yarn d={d} shouldDraw={shouldDraw} />
            {own && (
              <path
                className="yarn-hit"
                d={d}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onPickString(e.id);
                }}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Three strokes: a cast shadow on the cork, the body of the yarn, and a lit
 * top edge. That is what separates twisted string from a coloured line.
 *
 * Only string tied after the board has already painted draws itself, so a new
 * connection pulls taut in front of you while the ones that were already there
 * are simply there.
 */
function Yarn({ d, shouldDraw }: { d: string; shouldDraw: () => boolean }) {
  const group = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!shouldDraw() || !group.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const paths = Array.from(group.current.querySelectorAll("path"));
    animate(svg.createDrawable(paths), {
      draw: ["0 0", "0 1"],
      duration: 620,
      ease: "outQuad",
    });
    // Mount only: a string that is already hanging never redraws itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <g ref={group}>
      <path className="yarn-shadow" d={d} />
      <path className="yarn-core" d={d} />
      <path className="yarn-lit" d={d} />
    </g>
  );
}
