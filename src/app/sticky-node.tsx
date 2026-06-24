"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

// A pinned index-card / sticky note. Handles on all sides so visitors can drag
// red string from any edge to any other note.
export function StickyNode({ data }: NodeProps) {
  const body = (data as { body: string }).body;
  return (
    <div className="sticky-note">
      <div className="pin" />
      <Handle type="source" position={Position.Top} className="rf-handle" />
      <Handle type="target" position={Position.Bottom} className="rf-handle" />
      <Handle type="source" position={Position.Right} id="r" className="rf-handle" />
      <Handle type="target" position={Position.Left} id="l" className="rf-handle" />
      <p>{body}</p>
    </div>
  );
}

export function TopicNode({ data }: NodeProps) {
  return <div className="topic-label">{(data as { label: string }).label}</div>;
}
