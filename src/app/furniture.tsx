"use client";

import { Handle, Position } from "@xyflow/react";
import { FURNITURE } from "@/lib/wall";

const REPO = "https://github.com/nitrimandylis/loosethreads";

/**
 * The furniture, as React Flow nodes that never move: the wordmark on tape,
 * the card explaining the place, a redacted photograph and a torn piece of a
 * map. The node wrapper does the positioning now; the markup inside is the
 * same as it was when the board positioned it by hand.
 *
 * Each piece carries invisible handles at its corners so the pre-tied
 * furniture string has somewhere to attach, exactly where corner() in
 * wall.ts used to compute: 22px in from the sides, 8px in from top/bottom.
 */
function Corners() {
  const spots = [
    { id: "tl", left: "22px", top: "8px" },
    { id: "tr", left: "calc(100% - 22px)", top: "8px" },
    { id: "bl", left: "22px", top: "calc(100% - 8px)" },
    { id: "br", left: "calc(100% - 22px)", top: "calc(100% - 8px)" },
  ];
  return (
    <>
      {spots.map((s) => (
        <span key={s.id}>
          <Handle
            type="source"
            id={s.id}
            position={Position.Top}
            className="pin-handle"
            style={{ left: s.left, top: s.top }}
            isConnectable={false}
          />
          <Handle
            type="target"
            id={s.id}
            position={Position.Top}
            className="pin-handle"
            style={{ left: s.left, top: s.top }}
            isConnectable={false}
          />
        </span>
      ))}
    </>
  );
}

export function FurnitureNode({ data }: { data: { kind: keyof typeof FURNITURE } }) {
  const f = FURNITURE[data.kind];

  if (data.kind === "header") {
    return (
      <header className="wall-head" style={{ width: f.w }}>
        <Corners />
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <h1>Loose Threads</h1>
        <p>anonymous gossip · connect the dots</p>
      </header>
    );
  }

  if (data.kind === "rules") {
    return (
      <aside className="wall-rules" style={{ width: f.w }}>
        <Corners />
        <span className="pin" aria-hidden="true" />
        <h2>Read this first</h2>
        <p>Pin a rumour. Tie it to another one. Stamp the ones you believe.</p>
        <p>
          <strong>Nobody is checking this.</strong> There is no queue and no moderator on
          duty. There is only the wall.
        </p>
        <p className="rules-foot">
          Needs to come down? <a href={REPO} target="_blank" rel="noreferrer noopener">Say so</a>.
        </p>
      </aside>
    );
  }

  if (data.kind === "photo") {
    return (
      <figure className="wall-photo" style={{ width: f.w }}>
        <Corners />
        <span className="pin" aria-hidden="true" />
        <span className="photo-plate" aria-hidden="true">
          <span className="photo-redaction" />
        </span>
        <figcaption>Subject unknown</figcaption>
      </figure>
    );
  }

  return (
    <div className="wall-map" style={{ width: f.w, height: f.h }} aria-hidden="true">
      <Corners />
      <span className="pin" />
      <span className="map-mark" />
    </div>
  );
}
