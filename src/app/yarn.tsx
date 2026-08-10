"use client";

import { useEffect, useRef } from "react";
import { animate, svg } from "animejs";
import type { EdgeProps } from "@xyflow/react";
import { stringPath } from "@/lib/wall";

/**
 * The red string, as a React Flow custom edge. Three strokes: a cast shadow
 * on the cork, the body of the yarn, and a lit top edge; it sags between the
 * pins exactly as before, because the path still comes from stringPath().
 * React Flow hands us the handle positions (the pushpins) as sourceX/Y and
 * targetX/Y and keeps them current while a note is dragged, which is why
 * the string follows a moving note for free.
 *
 * Deliberately no pointer events anywhere in here: an invisible click
 * surface over the wall was how string used to swallow taps meant for the
 * notes underneath. Picking a string to untie it is the board's job now,
 * done by distance from a tap on bare cork.
 */
export type YarnData = {
  /** True for string tied after the page loaded: it draws itself taut in
      front of you, while string that was already there is simply there. */
  drawIn?: boolean;
};

export function YarnEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) {
  const d = stringPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY });
  const { drawIn } = (data ?? {}) as YarnData;

  const group = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!drawIn || !group.current) return;
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
