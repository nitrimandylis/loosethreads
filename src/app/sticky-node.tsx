"use client";

import { useContext, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { STAMPS } from "@/lib/reactions";
import { ageBucket } from "@/lib/aging";
import { paperFor } from "@/lib/paper";
import { StringMode } from "./canvas";

type StickyData = {
  id: number;
  body: string;
  createdAt: string;
  reactions: Record<string, number>;
};

export function StickyNode({ data }: NodeProps) {
  const d = data as StickyData;
  const [counts, setCounts] = useState<Record<string, number>>(d.reactions ?? {});
  const [showAll, setShowAll] = useState(false);
  const string = useContext(StringMode);

  const age = ageBucket(d.createdAt);
  const paper = paperFor(d.id);
  const earned = STAMPS.filter((s) => counts[s]);
  const unearned = STAMPS.filter((s) => !counts[s]);
  const visible = showAll ? STAMPS : earned;

  async function react(kind: string) {
    setCounts((c) => ({ ...c, [kind]: (c[kind] ?? 0) + 1 })); // optimistic
    const ok = await fetch("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "reaction", nodeId: d.id, kind }),
    })
      .then((r) => r.ok)
      .catch(() => false);
    // Don't leave a count showing a vote the server never took.
    if (!ok) setCounts((c) => ({ ...c, [kind]: Math.max(0, (c[kind] ?? 1) - 1) }));
  }

  const classes = [
    "sticky-note",
    `stock-${paper.stock}`,
    `age-${age}`,
    string.active ? "pickable" : "",
    string.sourceId === String(d.id) ? "string-end" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={
        { "--tilt": `${paper.tilt}deg`, "--pin-shift": `${paper.pinShift}px` } as React.CSSProperties
      }
    >
      {/* The paper itself. Separate from the card so aging can yellow the stock
          without draining the colour out of the pin, the ink and the stamps. */}
      <div className="paper" aria-hidden="true" />
      <div className="pin" />

      {/* Both ends of the string tie to the pin, so a connection runs pin to
          pin the way it does on a real wall. Sitting under .pin also means
          "drag off the pin" is the desktop gesture. */}
      <Handle type="source" position={Position.Top} className="rf-handle" />
      <Handle type="target" position={Position.Top} id="t" className="rf-handle" />

      <p>{d.body}</p>

      <div className="stamps nodrag nopan">
        {visible.map((s) => (
          <button
            key={s}
            className="stamp"
            onClick={() => react(s)}
            aria-label={counts[s] ? `${s}, ${counts[s]} so far` : s}
          >
            <span className="stamp-label">{s}</span>
            {counts[s] ? <span className="stamp-n">{counts[s]}</span> : null}
          </button>
        ))}
        {!showAll && unearned.length > 0 && (
          <button className="stamp stamp-more" onClick={() => setShowAll(true)}>
            {earned.length ? "+" : "Stamp it"}
          </button>
        )}
      </div>
    </div>
  );
}

export function TopicNode({ data }: NodeProps) {
  return <div className="topic-label">{(data as { label: string }).label}</div>;
}
