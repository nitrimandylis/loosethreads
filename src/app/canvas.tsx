"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodesInitialized,
  Panel,
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

function newestNote(notes: NoteRow[]): NoteRow | null {
  if (notes.length === 0) return null;
  return notes.reduce((a, b) => (Date.parse(a.created_at) >= Date.parse(b.created_at) ? a : b));
}

/**
 * Which notes the board should open on. Topic regions sit 1600px apart, so
 * framing every note at once puts the board at ~0.5 zoom and takes the
 * handwriting with it. The visitor lands in the void between regions.
 *
 * Desktop gets the whole region around the newest note. A phone can't fit a
 * region legibly at any zoom, so it gets the newest note alone, full size;
 * panning out from one readable note beats landing on six unreadable ones.
 */
function focusIds(notes: NoteRow[], narrow: boolean): { id: string }[] {
  const newest = newestNote(notes);
  if (!newest) return [];
  if (narrow) return [{ id: String(newest.id) }];
  return notes.filter((n) => n.topic === newest.topic).map((n) => ({ id: String(n.id) }));
}

const FOCUS = { padding: 0.32, maxZoom: 1, minZoom: 0.5 };
const OVERVIEW = { padding: 0.2, maxZoom: 0.9 };

/** Which note the visitor has picked as one end of a new string, if any. */
export const StringMode = createContext<{ active: boolean; sourceId: string | null }>({
  active: false,
  sourceId: null,
});

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
      data: { id: n.id, body: n.body, createdAt: n.created_at, reactions: n.reactions },
    }));
    return [...topicNodes, ...noteNodes];
  }, [notes]);

  const initialEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: String(e.id),
        source: String(e.source_id),
        target: String(e.target_id),
        // straight, not bezier: taut string between two pins, not a cable
        type: "straight",
        style: { stroke: RED, strokeWidth: 3 },
        animated: false,
      })),
    [edges]
  );

  // Local-only state: dragging notes / connecting updates THIS view only and is
  // never persisted. New connections are submitted to the moderation queue.
  const [rfNodes, , onNodesChange] = useNodesState(initialNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [toast, setToast] = useState<string | null>(null);
  const [stringSource, setStringSource] = useState<string | null>(null);
  const [stringMode, setStringMode] = useState(false);

  const say = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  const submitEdge = useCallback(
    async (sourceId: string, targetId: string) => {
      // optimistic dashed line so the visitor sees their pending link
      const optimisticId = `pending-${sourceId}-${targetId}-${Date.now()}`;
      setRfEdges((eds) => [
        ...eds,
        {
          id: optimisticId,
          source: sourceId,
          target: targetId,
          type: "straight",
          style: { stroke: RED, strokeWidth: 3, strokeDasharray: "6 4", opacity: 0.6 },
        },
      ]);
      const ok = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "edge", sourceId, targetId }),
      })
        .then((r) => r.ok)
        .catch(() => false);
      // A string left on the board after a failed submit reads as "tied". Take
      // it back. On success it's real, so drop the dashed pending treatment.
      setRfEdges((eds) =>
        ok
          ? eds.map((e) =>
              e.id === optimisticId ? { ...e, style: { stroke: RED, strokeWidth: 3 } } : e
            )
          : eds.filter((e) => e.id !== optimisticId)
      );
      say(ok ? "Tied." : "Could not tie that string.");
    },
    [setRfEdges, say]
  );

  // Desktop path: drag from one note's edge to another.
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      if (c.source.startsWith("topic-") || c.target.startsWith("topic-")) return;
      submitEdge(c.source, c.target);
    },
    [submitEdge]
  );

  // Touch path (and the discoverable one): tap a note, then tap another.
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!stringMode || node.id.startsWith("topic-")) return;
      if (!stringSource) {
        setStringSource(node.id);
        return;
      }
      if (stringSource === node.id) {
        setStringSource(null);
        return;
      }
      submitEdge(stringSource, node.id);
      setStringSource(null);
      setStringMode(false);
    },
    [stringMode, stringSource, submitEdge]
  );

  const exitStringMode = useCallback(() => {
    setStringMode(false);
    setStringSource(null);
  }, []);

  useEffect(() => {
    if (!stringMode) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && exitStringMode();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stringMode, exitStringMode]);

  const hasNotes = notes.length > 0;
  const stringCtx = useMemo(
    () => ({ active: stringMode, sourceId: stringSource }),
    [stringMode, stringSource]
  );

  return (
    <div className={`canvas-root${stringMode ? " tying" : ""}`}>
      <StringMode.Provider value={stringCtx}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          nodesDraggable={!stringMode}
          minZoom={0.25}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
        >
          <InitialView notes={notes} />
          <Panel position="top-right" className="board-chrome">
            <Recenter notes={notes} />
          </Panel>
        </ReactFlow>
      </StringMode.Provider>

      {!hasNotes && <EmptyBoard />}
      {hasNotes && <CaseNotice />}

      {stringMode && (
        <div className="tying-bar" role="status">
          <span>{stringSource ? "Now tap the note it connects to." : "Tap the first note."}</span>
          <button onClick={exitStringMode}>Cancel</button>
        </div>
      )}

      <Actions
        canTie={notes.length >= 2}
        stringMode={stringMode}
        onTieString={() => setStringMode(true)}
        onPosted={say}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

const isNarrow = () => window.matchMedia("(max-width: 640px)").matches;
const wantsReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function viewFor(notes: NoteRow[], narrow: boolean) {
  const focus = focusIds(notes, narrow);
  return focus.length ? { ...FOCUS, nodes: focus } : OVERVIEW;
}

/**
 * Frames the board once React Flow has measured the notes. Doing this here
 * rather than with the `fitView` prop means the viewport width is known (it
 * isn't during SSR) and the nodes have real dimensions, so the board lands on
 * the same zoom every load instead of wherever the first paint happened to be.
 */
function InitialView({ notes }: { notes: NoteRow[] }) {
  const measured = useNodesInitialized();
  const { fitView } = useReactFlow();
  const framed = useRef(false);

  useEffect(() => {
    if (!measured || framed.current) return;
    framed.current = true;

    // Wait for the handwriting to load before framing. The fonts load with
    // display:swap, so measuring now would use fallback metrics; when Kalam
    // arrives the notes reflow taller and the board is left framed around the
    // wrong bounds, clipping the top of the tallest note.
    let cancelled = false;
    const frame = () => {
      if (!cancelled) fitView(viewFor(notes, isNarrow()));
    };
    if (document.fonts?.ready) {
      document.fonts.ready.then(frame);
    } else {
      frame();
    }
    return () => {
      cancelled = true;
    };
  }, [measured, notes, fitView]);

  return null;
}

/** Puts the board back where it started. Replaces the minimap + zoom cluster. */
function Recenter({ notes }: { notes: NoteRow[] }) {
  const { fitView } = useReactFlow();
  return (
    <button
      className="chrome-btn"
      onClick={() =>
        fitView({ ...viewFor(notes, isNarrow()), duration: wantsReducedMotion() ? 0 : 420 })
      }
    >
      Re-centre
    </button>
  );
}

const REPO = "https://github.com/nitrimandylis/loosethreads";

/** Nothing on the board yet. Still has to be worth a screenshot. */
function EmptyBoard() {
  return (
    <div className="empty-board">
      <div className="case-card">
        <div className="pin" />
        <h2>Case file: open</h2>
        <p>
          Nothing has been pinned to this board yet. Anyone can add a rumour, anonymously, and
          it goes up the second they do.
        </p>
        <p className="case-foot">Nobody has talked yet. Be the first.</p>
      </div>
    </div>
  );
}

/** Permanent legend, so a stranger who lands cold knows what this place is. */
function CaseNotice() {
  return (
    <aside className="case-notice">
      <span className="case-notice-pin" />
      <strong>NOBODY IS CHECKING THIS.</strong>
      <br />
      There is no queue and no moderator on duty. There is only the board.
      <br />
      Move things around all you like. It never saves.
      <br />
      <a href={REPO} target="_blank" rel="noreferrer noopener">
        Grievances
      </a>
    </aside>
  );
}

function Actions({
  canTie,
  stringMode,
  onTieString,
  onPosted,
}: {
  canTie: boolean;
  stringMode: boolean;
  onTieString: () => void;
  onPosted: (msg: string) => void;
}) {
  const router = useRouter();
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
      onPosted("Pinned. It is on the board.");
      setBody("");
      setOpen(false);
      // It published immediately, so the board the visitor is looking at is
      // already out of date. Pull it in rather than making them reload.
      router.refresh();
    } else {
      const e = await res.json().catch(() => ({ error: "Failed" }));
      onPosted(e.error || "Failed to submit.");
    }
  }

  if (!open) {
    return (
      <div className="actions">
        {/* Tying string needs two notes to connect. */}
        {canTie && !stringMode && (
          <button className="ghost-btn" onClick={onTieString}>
            Tie string
          </button>
        )}
        <button className="add-btn" onClick={() => setOpen(true)}>
          Pin a rumour
        </button>
      </div>
    );
  }

  return (
    <div className="add-panel">
      <div className="add-head">
        <strong>New rumour</strong>
        <button onClick={() => setOpen(false)} aria-label="Close">
          ✕
        </button>
      </div>
      <textarea
        value={body}
        maxLength={500}
        placeholder="Spill it…"
        onChange={(e) => setBody(e.target.value)}
        autoFocus
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
        {busy ? "Pinning…" : "Pin it"}
      </button>
      <p className="hint">Anonymous, and public the moment you post it.</p>
    </div>
  );
}
