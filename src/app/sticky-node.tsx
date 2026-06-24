"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { STAMPS } from "@/lib/reactions";
import { ageBucket } from "@/lib/aging";

type StickyData = {
  id: number;
  body: string;
  createdAt: string;
  reactions: Record<string, number>;
};

export function StickyNode({ data }: NodeProps) {
  const d = data as StickyData;
  const [counts, setCounts] = useState<Record<string, number>>(d.reactions ?? {});
  const age = ageBucket(d.createdAt);

  async function react(kind: string) {
    setCounts((c) => ({ ...c, [kind]: (c[kind] ?? 0) + 1 })); // optimistic
    await fetch("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "reaction", nodeId: d.id, kind }),
    }).catch(() => {});
  }

  return (
    <div className={`sticky-note age-${age}`}>
      <div className="pin" />
      <Handle type="source" position={Position.Top} className="rf-handle" />
      <Handle type="target" position={Position.Bottom} className="rf-handle" />
      <Handle type="source" position={Position.Right} id="r" className="rf-handle" />
      <Handle type="target" position={Position.Left} id="l" className="rf-handle" />
      <p>{d.body}</p>
      <div className="stamps nodrag nopan">
        {STAMPS.map((s) => (
          <button key={s} className="stamp" onClick={() => react(s)} title={s}>
            {s} {counts[s] ? <span className="stamp-n">{counts[s]}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TopicNode({ data }: NodeProps) {
  return <div className="topic-label">{(data as { label: string }).label}</div>;
}
