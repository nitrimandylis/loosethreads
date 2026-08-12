"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { animate } from "animejs";
import {
  ReactFlow,
  ViewportPortal,
  type Node,
  type Edge,
  type NodeChange,
  type Viewport,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NoteNode, type NoteNodeData } from "./note";
import { FurnitureNode } from "./furniture";
import { YarnEdge, type YarnData } from "./yarn";
import { Compose } from "./compose";
import { paperFor } from "@/lib/paper";
import {
  wallBounds,
  landingScale,
  steppedBackScale,
  heartOf,
  pinOf,
  stringDistance,
  furnitureFrame,
  shotFrame,
  frameVisible,
  fitScale,
  FURNITURE,
} from "@/lib/wall";
import { rememberNote, rememberEdge, edgeSecret, forgetEdge } from "@/lib/mine";
import { postApi, onPrivateBoard } from "@/lib/post";
import {
  subscribeMoves,
  getMoves,
  getServerMoves,
  writeMove,
  stageMove,
  dropStaged,
  settleMoves,
  applyMoves,
} from "@/lib/moved";
import type { NoteRow, EdgeRow } from "@/lib/queries";

/** How often the wall re-reads itself while somebody is looking at it. */
const POLL_MS = 15_000;

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** (a,b) and (b,a) are the same piece of string. */
const pairKey = (e: EdgeRow) =>
  e.source_id < e.target_id ? `${e.source_id}:${e.target_id}` : `${e.target_id}:${e.source_id}`;

// Registered once, outside the component: React Flow treats a new types
// object as a full re-registration.
const nodeTypes = { note: NoteNode, furniture: FurnitureNode };
const edgeTypes = { yarn: YarnEdge };

// Layering, same numbers the CSS comment always promised: furniture 1,
// notes 2, string 3. A picked note rises to 8, above the string.
const Z_FURNITURE = 1;
const Z_NOTE = 2;
const Z_STRING = 3;
const Z_PICKED = 8;

/** String that was on the wall before anybody pinned anything. */
const FURNITURE_STRINGS: Array<[string, string, string, string]> = [
  ["rules", "tr", "header", "bl"],
  ["header", "br", "photo", "tl"],
  ["photo", "bl", "map", "tr"],
];

/** The viewport that puts board point `p` in the middle of a vw x vh screen. */
function centreOn(p: { x: number; y: number }, zoom: number, vw: number, vh: number): Viewport {
  return { x: vw / 2 - p.x * zoom, y: vh / 2 - p.y * zoom, zoom };
}

/**
 * The wall.
 *
 * React Flow owns the viewport now: panning, pinching, the zoom clamps, and
 * dragging notes are all its gestures (configured to feel like a surface,
 * not a node editor: scroll pans, pinch zooms, nothing selects, nothing
 * connects, no dot grid, no minimap). Everything visible is still ours: the
 * notes and furniture render unchanged inside custom nodes, and the string
 * is a custom edge drawn by stringPath, so the wall looks exactly as it did
 * when the board was a scroll container.
 */
export default function Board({ notes: served, edges: servedEdges }: {
  notes: NoteRow[];
  edges: EdgeRow[];
}) {
  const router = useRouter();

  const boardEl = useRef<HTMLDivElement>(null);
  const rf = useRef<ReactFlowInstance | null>(null);

  // Things this visitor added since the page loaded. They are already public;
  // this only spares them a reload before their own rumour shows up.
  const [addedNotes, setAddedNotes] = useState<NoteRow[]>([]);
  const [addedEdges, setAddedEdges] = useState<EdgeRow[]>([]);

  // What was on the wall when this visitor arrived. A note not in here came
  // in while they were reading, and settles onto the cork instead of popping;
  // a string not in here draws itself taut instead of just hanging there.
  const [initialIds] = useState(() => new Set(served.map((n) => n.id)));
  const [initialEdgeIds] = useState(() => new Set(servedEdges.map((e) => e.id)));

  const [picked, setPicked] = useState<number | null>(null);
  const [tyingFrom, setTyingFrom] = useState<number | null>(null);
  // Notes this visitor took down (their own): hidden now, gone from the
  // server on the next poll anyway.
  const [downIds, setDownIds] = useState<Set<number>>(new Set());
  // A string of yours you tapped (the untie chip shows), and strings untied.
  const [pickedString, setPickedString] = useState<number | null>(null);
  const [cutIds, setCutIds] = useState<Set<number>>(new Set());
  // Notes this browser dragged somewhere else. Client-side only: the shared
  // wall never learns about it.
  const moves = useSyncExternalStore(subscribeMoves, getMoves, getServerMoves);
  // Where a note is right now, mid-drag, before the move commits.
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({});
  // React Flow measures every node on mount and reports it as a change.
  // The nodes array is rebuilt from scratch each render, so the measurements
  // are kept here and merged back in; without them a node never counts as
  // initialized, refuses to drag, and its string has no anchors.
  const [dims, setDims] = useState<Record<string, { width: number; height: number }>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const [minZoom, setMinZoom] = useState(0.14);
  const [landing, setLanding] = useState<{ note: NoteRow; from: { x: number; y: number } } | null>(
    null
  );

  const notes = useMemo(() => {
    const seen = new Set(served.map((n) => n.id));
    const live = [...served, ...addedNotes.filter((n) => !seen.has(n.id))].filter(
      (n) => !downIds.has(n.id)
    );
    // Local rearrangement last: the string follows because the handles do.
    return applyMoves(live, moves);
  }, [served, addedNotes, downIds, moves]);

  const edges = useMemo(() => {
    // One string per pair, whichever list it came from: re-tying an existing
    // pair answers with the same edge id, so the added list can repeat itself.
    const seen = new Set(servedEdges.map(pairKey));
    const out = [...servedEdges];
    for (const e of addedEdges) {
      const k = pairKey(e);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    // A downed note takes its strings with it, same as the server join does;
    // an untied string just comes off.
    return out.filter(
      (e) => !downIds.has(e.source_id) && !downIds.has(e.target_id) && !cutIds.has(e.id)
    );
  }, [servedEdges, addedEdges, downIds, cutIds]);

  const bounds = useMemo(() => wallBounds(notes), [notes]);

  const landed = useRef<number | null>(null);
  // Where the visitor was reading when they pinned, to go back to afterwards.
  const returnTo = useRef<Viewport | null>(null);
  // Flipped by any user gesture; the shot and the return check it.
  const userMoved = useRef(false);
  // Said once: after the first drag on a private board, moving things is just
  // what the board does and a toast per note would be noise.
  const movedOnce = useRef(false);

  const say = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3200);
  }, []);

  const measure = useCallback(() => {
    const el = boardEl.current;
    return el
      ? { vw: el.clientWidth, vh: el.clientHeight }
      : { vw: window.innerWidth, vh: window.innerHeight };
  }, []);

  // The survey scale is the zoom floor, so stepping back by pinching stops
  // exactly where the step-back button would have gone.
  useEffect(() => {
    const set = () => {
      const { vw, vh } = measure();
      setMinZoom(steppedBackScale(bounds, vw, vh));
    };
    set();
    window.addEventListener("resize", set);
    return () => window.removeEventListener("resize", set);
  }, [bounds, measure]);

  // A poll (or any re-render from the server) is how a private-board move
  // comes back as fact. Once the wall agrees with what this browser is holding
  // on to, it stops holding on, and somebody else moving that note afterwards
  // is free to win.
  useEffect(() => {
    settleMoves(served);
  }, [served]);

  // Everything publishes instantly, so somebody else's rumour can land while
  // you are reading. Only while the tab is actually being looked at.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTyingFrom(null);
      setPicked(null);
      setPickedString(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * First framing, on React Flow's init. If the landing view would already
   * show the wordmark and the rules card, land straight on it. Otherwise
   * open on the furniture so a stranger reads what this is, hold a beat,
   * then travel to the busiest patch. Any gesture hands the viewport over.
   */
  const onInit = useCallback(
    (instance: ReactFlowInstance) => {
      rf.current = instance;

      const { vw, vh } = measure();
      const b = wallBounds(notes);
      const z = landingScale(b, vw, vh);
      const landingView = centreOn(heartOf(notes, b), z, vw, vh);

      if (frameVisible(furnitureFrame(), z, heartOf(notes, b), vw, vh)) {
        instance.setViewport(landingView);
        return;
      }

      const frame = shotFrame(vw, vh);
      const shotZoom = Math.min(1, fitScale(frame, vw, vh));
      instance.setViewport(
        centreOn({ x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 }, shotZoom, vw, vh)
      );

      setTimeout(() => {
        if (userMoved.current) return; // they grabbed the wall; it is theirs
        instance.setViewport(landingView, reduced() ? undefined : { duration: 900 });
      }, 700);
    },
    // Mount-time framing over the notes served with the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measure]
  );

  /** Every viewport change: keep the cork and the counter-scale in step. */
  const onMove = useCallback((_evt: unknown, vp: Viewport) => {
    const el = boardEl.current;
    if (!el) return;
    el.style.setProperty("--inv", String(1 / vp.zoom));
    // The cork grain pans with the wall but never zooms, exactly like the
    // old scroller's background-attachment: local. The lighting gradient
    // stays put; it is the room, not the wall.
    el.style.backgroundPosition = `${vp.x}px ${vp.y}px, ${vp.x}px ${vp.y}px, ${vp.x + 14}px ${vp.y + 5}px, 0 0`;
  }, []);

  const onMoveStart = useCallback((evt: unknown) => {
    // A real gesture has an event; programmatic setViewport passes null.
    if (evt) userMoved.current = true;
  }, []);

  const onMoveEnd = useCallback(
    (_evt: unknown, vp: Viewport) => {
      const { vw, vh } = measure();
      // Keep the step button's label honest after a manual zoom-out.
      setWide(vp.zoom <= steppedBackScale(bounds, vw, vh) * 1.05);
    },
    [bounds, measure]
  );

  /** Your own note travelling from the sheet you wrote it on to the wall. */
  useEffect(() => {
    if (!landing || landed.current === landing.note.id) return;
    landed.current = landing.note.id;
    const { note, from } = landing;
    const instance = rf.current;
    if (!instance) return;

    const { vw, vh } = measure();
    const zoom = instance.getViewport().zoom;
    instance.setViewport(centreOn({ x: note.x + 100, y: note.y + 70 }, zoom, vw, vh));

    const el = document.querySelector<HTMLElement>(`[data-note-id="${note.id}"]`);
    // Under reduced motion the note does not travel, and neither does the
    // view afterwards: a silent teleport back would disorient more than
    // staying put, so the visitor keeps the viewport from here.
    if (!el || reduced()) return;

    const box = el.getBoundingClientRect();
    const tilt = paperFor(note.id, note.body.length).tilt;
    animate(el, {
      translateX: [from.x - (box.left + box.width / 2), 0],
      translateY: [from.y - (box.top + box.height / 2), 0],
      rotate: [`${tilt - 7}deg`, `${tilt}deg`],
      scale: [1.06, 1],
      duration: 760,
      ease: "outBack",
      // Hand the note back to the stylesheet so hover and tilt keep working.
      onComplete: () => {
        el.style.transform = "";
      },
    });

    // Let the landing be seen, then take them back to where they were
    // reading. Touching the board in the meantime keeps the viewport.
    const saved = returnTo.current;
    returnTo.current = null;
    if (!saved) return;

    userMoved.current = false;
    const timer = setTimeout(() => {
      if (userMoved.current) return;
      rf.current?.setViewport(saved, { duration: 700 });
    }, 760 + 600); // after the landing animation plus a beat

    return () => clearTimeout(timer);
  }, [landing, measure]);

  const tie = useCallback(
    async (a: number, b: number) => {
      const res = await postApi("/api/submit", { type: "edge", sourceId: a, targetId: b });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.edge) {
        say(data.error || "That string did not hold.");
        return;
      }
      // Strings are de-duplicated by their pair, so re-tying an existing one
      // never doubles up. A secret only comes back for a genuinely new
      // string; it is what lets this browser untie it later.
      setAddedEdges((es) => [...es, data.edge as EdgeRow]);
      if (data.secret) rememberEdge(data.edge.id, data.secret);
      say("Tied.");
    },
    [say]
  );

  /**
   * A drag ended.
   *
   * On a private board that is a real move and everybody on it will see it, so
   * it goes to the server and is only held here until a poll brings it back.
   * On the public wall it stays in this browser, which is what stops a stranger
   * rearranging a wall other strangers are reading.
   */
  const onMoved = useCallback(
    async (id: number, x: number, y: number) => {
      if (!onPrivateBoard()) {
        const first = Object.keys(getMoves()).length === 0;
        writeMove(id, x, y);
        if (first) say("Moved for you. Everyone else sees it where it was.");
        return;
      }

      stageMove(id, x, y);
      const res = await postApi("/api/board/move", { id, x, y }).catch(() => null);
      if (!res?.ok) {
        // Put it back where the wall says it is, rather than leaving it
        // somewhere only this browser believes in.
        dropStaged(id);
        say("That would not move.");
        return;
      }
      if (!movedOnce.current) {
        movedOnce.current = true;
        say("Moved for everyone on this board.");
      }
    },
    [say]
  );

  const onPick = useCallback(
    (id: number) => {
      setPickedString(null); // picking a note puts the string down
      if (tyingFrom !== null) {
        if (tyingFrom !== id) tie(tyingFrom, id);
        setTyingFrom(null);
        return;
      }
      setPicked((p) => (p === id ? null : id));
    },
    [tyingFrom, tie]
  );

  const onTie = useCallback((id: number) => {
    setTyingFrom(id);
    setPicked(null);
  }, []);

  const onTakedown = useCallback((id: number) => {
    setDownIds((s) => new Set(s).add(id));
  }, []);

  /**
   * A tap on bare cork. If it lands on (or near) a string this browser tied,
   * that picks the string for untying; otherwise it puts everything down.
   * Distance math instead of an invisible click surface, because a fat hit
   * path over the wall swallowed taps meant for the notes under it.
   */
  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      const instance = rf.current;
      if (instance && tyingFrom === null) {
        const p = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const zoom = instance.getViewport().zoom;
        let best: { id: number; d: number } | null = null;
        for (const e of edges) {
          // On a private board every string is yours to cut; on the public
          // wall only the ones this browser tied are pickable at all.
          if (!onPrivateBoard() && edgeSecret(e.id) === null) continue;
          const a = notes.find((n) => n.id === e.source_id);
          const b = notes.find((n) => n.id === e.target_id);
          if (!a || !b) continue;
          const d = stringDistance(pinOf(a), pinOf(b), p);
          if (!best || d < best.d) best = { id: e.id, d };
        }
        // A fingertip's worth of slack on screen, whatever the zoom.
        if (best && best.d * zoom < 16) {
          setPicked(null);
          setPickedString(best.id);
          return;
        }
      }
      setPicked(null);
      setTyingFrom(null);
      setPickedString(null);
    },
    [edges, notes, tyingFrom]
  );

  // React Flow reports drag positions and mount-time measurements as node
  // changes; everything else about the nodes is derived state rebuilt each
  // render, so these two are the only changes worth keeping.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const c of changes) {
      if (c.type === "position" && c.position && c.dragging) {
        const position = c.position;
        setDragPos((d) => ({ ...d, [c.id]: position }));
      }
      if (c.type === "dimensions" && c.dimensions) {
        const dimensions = c.dimensions;
        setDims((d) => {
          const had = d[c.id];
          if (had && had.width === dimensions.width && had.height === dimensions.height) return d;
          return { ...d, [c.id]: dimensions };
        });
      }
    }
  }, []);

  const onNodeDragStop = useCallback(
    (_evt: unknown, node: Node) => {
      if (node.type !== "note") return;
      onMoved(Number(node.id), node.position.x, node.position.y);
      setDragPos((d) => {
        const next = { ...d };
        delete next[node.id];
        return next;
      });
    },
    [onMoved]
  );

  const tying = tyingFrom !== null;

  const rfNodes = useMemo<Node[]>(() => {
    const furniture: Node[] = (Object.keys(FURNITURE) as Array<keyof typeof FURNITURE>).map(
      (kind) => ({
        id: `f-${kind}`,
        type: "furniture",
        position: { x: FURNITURE[kind].x, y: FURNITURE[kind].y },
        data: { kind },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: Z_FURNITURE,
        measured: dims[`f-${kind}`],
      })
    );
    const papers: Node[] = notes.map((n) => ({
      id: String(n.id),
      type: "note",
      position: dragPos[n.id] ?? { x: n.x, y: n.y },
      data: {
        note: n,
        selected: picked === n.id,
        tying,
        isSource: tyingFrom === n.id,
        settle: !initialIds.has(n.id) && landing?.note.id !== n.id,
        say,
        onTakedown,
        onPick,
        onTie,
      } satisfies NoteNodeData,
      // In tying mode a press is a tap on a target, never a drag.
      draggable: !tying,
      selectable: false,
      focusable: false,
      zIndex: picked === n.id ? Z_PICKED : Z_NOTE,
      measured: dims[String(n.id)],
    }));
    return [...furniture, ...papers];
  }, [notes, dragPos, dims, picked, tying, tyingFrom, initialIds, landing, say, onTakedown, onPick, onTie]);

  const rfEdges = useMemo<Edge[]>(() => {
    const dressing: Edge[] = FURNITURE_STRINGS.map(([s, sh, t, th], i) => ({
      id: `fs-${i}`,
      source: `f-${s}`,
      sourceHandle: sh,
      target: `f-${t}`,
      targetHandle: th,
      type: "yarn",
      zIndex: Z_STRING,
      data: {} satisfies YarnData,
    }));
    const tied: Edge[] = edges.map((e) => ({
      id: `e${e.id}`,
      source: String(e.source_id),
      sourceHandle: "s",
      target: String(e.target_id),
      targetHandle: "t",
      type: "yarn",
      zIndex: Z_STRING,
      data: { drawIn: !initialEdgeIds.has(e.id) } satisfies YarnData,
    }));
    return [...dressing, ...tied];
  }, [edges, initialEdgeIds]);

  function stepBack() {
    const instance = rf.current;
    if (!instance) return;
    const { vw, vh } = measure();
    const options = reduced() ? undefined : { duration: 560 };

    if (!wide) {
      const centre = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
      instance.setViewport(centreOn(centre, steppedBackScale(bounds, vw, vh), vw, vh), options);
      setWide(true);
    } else {
      const vp = instance.getViewport();
      const here = { x: (vw / 2 - vp.x) / vp.zoom, y: (vh / 2 - vp.y) / vp.zoom };
      instance.setViewport(centreOn(here, landingScale(bounds, vw, vh), vw, vh), options);
      setWide(false);
    }
  }

  /** The untie chip hangs at the picked string's droop, in wall coordinates
      via the viewport portal. Only string this browser tied is pickable, so
      the chip always has a secret. */
  const chip = (() => {
    if (pickedString === null) return null;
    const e = edges.find((x) => x.id === pickedString);
    if (!e) return null;
    const a = notes.find((n) => n.id === e.source_id);
    const b = notes.find((n) => n.id === e.target_id);
    if (!a || !b) return null;
    const pa = pinOf(a);
    const pb = pinOf(b);
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    const mid = {
      x: (pa.x + pb.x) / 2,
      y: (pa.y + pb.y) / 2 + Math.min(62, len * 0.075),
    };
    return (
      <button
        className="untie-chip nodrag nopan"
        style={{ left: mid.x, top: mid.y }}
        onClick={async (ev) => {
          ev.stopPropagation();
          const secret = edgeSecret(e.id) ?? "";
          setPickedString(null);
          if (!secret && !onPrivateBoard()) return;
          const res = await postApi("/api/manage", { action: "untie", id: e.id, secret }).catch(() => null);
          if (res?.ok) {
            forgetEdge(e.id);
            setCutIds((s) => new Set(s).add(e.id));
            say("Untied.");
          } else {
            say("That string is staying up.");
          }
        }}
      >
        Untie
      </button>
    );
  })();

  return (
    <div className="stage">
      <div className={`board${tying ? " tying" : ""}`} ref={boardEl}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={onInit}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onMove={onMove}
          onMoveStart={onMoveStart}
          onMoveEnd={onMoveEnd}
          onPaneClick={onPaneClick}
          // A surface, not a node editor: scroll pans, pinch zooms, nothing
          // selects, nothing connects, double-click does not zoom.
          panOnScroll
          zoomOnScroll={false}
          zoomOnPinch
          zoomOnDoubleClick={false}
          nodesConnectable={false}
          elementsSelectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          deleteKeyCode={null}
          minZoom={minZoom}
          maxZoom={1}
          translateExtent={[
            [bounds.x, bounds.y],
            [bounds.x + bounds.w, bounds.y + bounds.h],
          ]}
          proOptions={{ hideAttribution: true }}
        >
          <ViewportPortal>{chip}</ViewportPortal>
        </ReactFlow>
      </div>

      {tying && (
        <div className="tying-bar" role="status">
          <span>Tap the note it ties to.</span>
          <button onClick={() => setTyingFrom(null)}>Cancel</button>
        </div>
      )}

      <button className="step-btn" onClick={stepBack} aria-pressed={wide}>
        {wide ? "Step in" : "Step back"}
      </button>

      <Compose
        onPinned={(note, from, secret) => {
          rememberNote(note.id, secret);
          returnTo.current = rf.current?.getViewport() ?? null;
          setAddedNotes((ns) => [...ns, note]);
          setLanding({ note, from });
          say("Pinned. It is on the wall.");
        }}
        say={say}
      />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
