"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { StickyNode, TopicNode } from "./sticky-node";
import { TOPICS } from "@/lib/topics";
import type { NoteRow, EdgeRow } from "@/lib/queries";

const nodeTypes = { sticky: StickyNode, topic: TopicNode };
const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const RED = "#c0231f";

export default function Canvas({ notes, edges }: { notes: NoteRow[]; edges: EdgeRow[] }) {
  const initialNodes: Node[] = useMemo(() => {
    const topicNodes: Node[] = TOPICS.map((t) => ({
      id: `topic-${t.id}`,
      type: "topic",
      position: { x: t.cx - 120, y: t.cy - 320 },
      data: { label: t.label },
      draggable: false,
      selectable: false,
      zIndex: -1,
    }));
    const noteNodes: Node[] = notes.map((n) => ({
      id: String(n.id),
      type: "sticky",
      position: { x: n.x, y: n.y },
      data: { body: n.body },
    }));
    return [...topicNodes, ...noteNodes];
  }, [notes]);

  const initialEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: String(e.id),
        source: String(e.source_id),
        target: String(e.target_id),
        style: { stroke: RED, strokeWidth: 2 },
        animated: false,
      })),
    [edges]
  );

  // Local-only state: dragging notes / connecting updates THIS view only and is
  // never persisted. New connections are submitted to the moderation queue.
  const [rfNodes, , onNodesChange] = useNodesState(initialNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [toast, setToast] = useState<string | null>(null);

  const onConnect = useCallback(
    async (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      if (c.source.startsWith("topic-") || c.target.startsWith("topic-")) return;
      // optimistic dashed line so the visitor sees their pending link
      setRfEdges((eds) => [
        ...eds,
        {
          id: `pending-${c.source}-${c.target}-${Date.now()}`,
          source: c.source!,
          target: c.target!,
          style: { stroke: RED, strokeWidth: 2, strokeDasharray: "6 4", opacity: 0.6 },
        },
      ]);
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "edge", sourceId: c.source, targetId: c.target }),
      });
      setToast(res.ok ? "Connection submitted for review." : "Could not submit connection.");
      setTimeout(() => setToast(null), 3000);
    },
    [setRfEdges]
  );

  return (
    <div className="canvas-root">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#3a3530" gap={32} />
        <Controls />
        <MiniMap pannable zoomable nodeColor="#d8c48a" maskColor="rgba(0,0,0,0.6)" />
      </ReactFlow>

      <AddPanel onPosted={(m) => { setToast(m); setTimeout(() => setToast(null), 3000); }} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function AddPanel({ onPosted }: { onPosted: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [topic, setTopic] = useState(TOPICS[0].id);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const token =
      (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value ||
      null;
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body, topic, turnstileToken: token }),
    });
    setBusy(false);
    if (res.ok) {
      onPosted("Gossip submitted — it'll appear once approved.");
      setBody("");
      setOpen(false);
    } else {
      const e = await res.json().catch(() => ({ error: "Failed" }));
      onPosted(e.error || "Failed to submit.");
    }
  }

  if (!open) {
    return (
      <button className="add-btn" onClick={() => setOpen(true)}>
        + Add gossip
      </button>
    );
  }

  return (
    <div className="add-panel">
      <div className="add-head">
        <strong>New gossip</strong>
        <button onClick={() => setOpen(false)} aria-label="Close">✕</button>
      </div>
      <textarea
        value={body}
        maxLength={500}
        placeholder="Spill it… (max 500 chars)"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="count">{body.length}/500</div>
      <label>
        Topic
        <select value={topic} onChange={(e) => setTopic(e.target.value)}>
          {TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {siteKey && <div className="cf-turnstile" data-sitekey={siteKey} data-theme="dark" />}
      <button className="submit-btn" disabled={busy || !body.trim()} onClick={submit}>
        {busy ? "Submitting…" : "Submit for review"}
      </button>
      <p className="hint">Drag from one note to another to connect them with red string.</p>
    </div>
  );
}
