"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { animate } from "animejs";
import { Note } from "./note";
import { Strings } from "./strings";
import { Compose } from "./compose";
import { paperFor } from "@/lib/paper";
import { wallBounds, landingScale, steppedBackScale, heartOf, pinOf, FURNITURE } from "@/lib/wall";
import { mountTurnstile, getToken } from "@/lib/turnstile-client";
import type { NoteRow, EdgeRow } from "@/lib/queries";

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const REPO = "https://github.com/nitrimandylis/loosethreads";

/** How often the wall re-reads itself while somebody is looking at it. */
const POLL_MS = 15_000;

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** (a,b) and (b,a) are the same piece of string. */
const pairKey = (e: EdgeRow) =>
  e.source_id < e.target_id ? `${e.source_id}:${e.target_id}` : `${e.target_id}:${e.source_id}`;

/**
 * The wall.
 *
 * There is no canvas library under this. The board is one scrollable surface
 * with a CSS scale on it, notes positioned from their stored coordinates, and
 * an SVG layer for the string. React Flow used to do this and brought its own
 * look with it: node wrappers we could not style, connection handles that read
 * as ports, and a viewport that behaved like a graph editor.
 */
export default function Board({ notes: served, edges: servedEdges }: {
  notes: NoteRow[];
  edges: EdgeRow[];
}) {
  const router = useRouter();

  const scroller = useRef<HTMLDivElement>(null);
  const sizer = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const gate = useRef<HTMLDivElement>(null);

  // Things this visitor added since the page loaded. They are already public;
  // this only spares them a reload before their own rumour shows up.
  const [addedNotes, setAddedNotes] = useState<NoteRow[]>([]);
  const [addedEdges, setAddedEdges] = useState<EdgeRow[]>([]);

  const [picked, setPicked] = useState<number | null>(null);
  const [tyingFrom, setTyingFrom] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const [scale, setScale] = useState(1);
  const [landing, setLanding] = useState<{ note: NoteRow; from: { x: number; y: number } } | null>(
    null
  );

  const notes = useMemo(() => {
    const seen = new Set(served.map((n) => n.id));
    return [...served, ...addedNotes.filter((n) => !seen.has(n.id))];
  }, [served, addedNotes]);

  const edges = useMemo(() => {
    const seen = new Set(servedEdges.map(pairKey));
    return [...servedEdges, ...addedEdges.filter((e) => !seen.has(pairKey(e)))];
  }, [servedEdges, addedEdges]);

  const bounds = useMemo(() => wallBounds(notes), [notes]);

  // Refs shadow the state the imperative view code reads, because the scale
  // animation runs outside React, frame by frame, and must not see a stale
  // closure. Kept in sync in an effect declared before every effect that
  // reads them, so they are current by the time anything uses them.
  const boundsRef = useRef(bounds);
  const scaleRef = useRef(scale);
  const painted = useRef(false);
  const landed = useRef<number | null>(null);

  useEffect(() => {
    boundsRef.current = bounds;
    scaleRef.current = scale;
  });

  /** Read in an effect, never during render: has the board painted once? */
  const hasPainted = useCallback(() => painted.current, []);

  const say = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3200);
  }, []);

  /** Put the wall at scale `s` with board point `focus` in the middle. */
  const view = useCallback((s: number, focus: { x: number; y: number }) => {
    const el = scroller.current;
    const box = sizer.current;
    const sur = surface.current;
    if (!el || !box || !sur) return;
    const b = boundsRef.current;
    box.style.width = `${b.w * s}px`;
    box.style.height = `${b.h * s}px`;
    sur.style.transform = `scale(${s})`;
    sur.style.setProperty("--inv", String(1 / s));
    el.scrollLeft = (focus.x - b.x) * s - el.clientWidth / 2;
    el.scrollTop = (focus.y - b.y) * s - el.clientHeight / 2;
  }, []);

  const centreOfView = useCallback(() => {
    const el = scroller.current;
    const b = boundsRef.current;
    if (!el) return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    return {
      x: (el.scrollLeft + el.clientWidth / 2) / scaleRef.current + b.x,
      y: (el.scrollTop + el.clientHeight / 2) / scaleRef.current + b.y,
    };
  }, []);

  // First framing: the widest view of the wall that leaves the writing
  // readable. If the wall is bigger than that, they land on the busiest patch
  // of it rather than on whichever corner happened to be at the origin.
  useEffect(() => {
    const el = scroller.current;
    if (!el || painted.current) return;
    painted.current = true;
    const s = landingScale(boundsRef.current, el.clientWidth, el.clientHeight);
    scaleRef.current = s;
    setScale(s);
    const focus = heartOf(notes, boundsRef.current);
    requestAnimationFrame(() => view(s, focus));
    // Deliberately once, on mount: after this the visitor owns the viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One Turnstile widget for the whole board, so tying string can get a token
  // too. The script is loaded by the page; wait for it rather than racing it.
  useEffect(() => {
    if (!siteKey || !gate.current) return;
    const el = gate.current;
    let tries = 0;
    const id = setInterval(() => {
      if (window.turnstile) {
        mountTurnstile(el, siteKey);
        clearInterval(id);
      } else if (++tries > 40) {
        clearInterval(id);
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Your own note travelling from the sheet you wrote it on to the wall. */
  useEffect(() => {
    if (!landing || landed.current === landing.note.id) return;
    landed.current = landing.note.id;
    const { note, from } = landing;

    view(scaleRef.current, { x: note.x + 100, y: note.y + 70 });
    const el = document.querySelector<HTMLElement>(`[data-note-id="${note.id}"]`);
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
  }, [landing, view]);

  const tie = useCallback(
    async (a: number, b: number) => {
      const token = await getToken();
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "edge", sourceId: a, targetId: b, turnstileToken: token }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        say(e.error || "That string did not hold.");
        return;
      }
      // The server does not hand back an edge id, so this one carries a
      // negative placeholder until the next poll replaces it. Strings are
      // de-duplicated by their pair, not their id, so it never doubles up.
      setAddedEdges((es) => [...es, { id: -Date.now(), source_id: a, target_id: b }]);
      say("Tied.");
    },
    [say]
  );

  const onPick = useCallback(
    (id: number) => {
      if (tyingFrom !== null) {
        if (tyingFrom !== id) tie(tyingFrom, id);
        setTyingFrom(null);
        return;
      }
      setPicked((p) => (p === id ? null : id));
    },
    [tyingFrom, tie]
  );

  // ---- grab the cork and pull ----
  // A press only counts as the board's if it started on bare cork. Without
  // that check every tap on a note bubbled up here and cleared the selection
  // and tie-in-progress before the note's own click could act on it.
  const drag = useRef<{
    x: number;
    y: number;
    l: number;
    t: number;
    moved: boolean;
    pan: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("article, aside, button, a, textarea, input")) return;
    const el = scroller.current;
    if (!el) return;
    // Drag-to-pan is a mouse gesture; touch already has momentum scrolling.
    const pan = e.pointerType === "mouse" && e.button === 0;
    drag.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop, moved: false, pan };
    if (pan) el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = scroller.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    if (!d.pan) return;
    el.scrollLeft = d.l - dx;
    el.scrollTop = d.t - dy;
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    // A click on bare cork puts everything down. A drag does not.
    if (d && !d.moved) {
      setPicked(null);
      setTyingFrom(null);
    }
  };

  function stepBack() {
    const el = scroller.current;
    if (!el) return;
    const b = boundsRef.current;
    const from = scaleRef.current;
    const to = wide
      ? landingScale(b, el.clientWidth, el.clientHeight)
      : steppedBackScale(b, el.clientWidth, el.clientHeight);
    const focus = wide ? centreOfView() : { x: b.x + b.w / 2, y: b.y + b.h / 2 };

    setWide(!wide);
    const settle = () => {
      scaleRef.current = to;
      setScale(to);
      requestAnimationFrame(() => view(to, focus));
    };

    if (reduced()) {
      settle();
      return;
    }
    const proxy = { s: from };
    animate(proxy, {
      s: to,
      duration: 560,
      ease: "inOutQuint",
      onUpdate: () => view(proxy.s, focus),
      onComplete: settle,
    });
  }

  const pins = useMemo(() => {
    const m = new Map<number, { x: number; y: number }>();
    for (const n of notes) {
      const p = pinOf(n);
      m.set(n.id, { x: p.x - bounds.x, y: p.y - bounds.y });
    }
    return m;
  }, [notes, bounds]);

  const tying = tyingFrom !== null;

  return (
    // The chrome is a sibling of the scroller, not a child of it: anything
    // absolutely positioned inside a scroll container scrolls away with the
    // wall, which took the one action button off the screen on a phone.
    <div className="stage">
      <div
        className={`board${tying ? " tying" : ""}`}
        ref={scroller}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
        className="wall"
        ref={sizer}
        style={{ width: bounds.w * scale, height: bounds.h * scale }}
      >
        <div
          className="wall-surface"
          ref={surface}
          style={
            {
              width: bounds.w,
              height: bounds.h,
              transform: `scale(${scale})`,
              "--inv": 1 / scale,
            } as React.CSSProperties
          }
        >
          <header
            className="wall-head"
            style={{
              left: FURNITURE.header.x - bounds.x,
              top: FURNITURE.header.y - bounds.y,
              width: FURNITURE.header.w,
            }}
          >
            <span className="tape tape-l" aria-hidden="true" />
            <span className="tape tape-r" aria-hidden="true" />
            <h1>Loose Threads</h1>
            <p>anonymous gossip · connect the dots</p>
          </header>

          <aside
            className="wall-rules"
            style={{
              left: FURNITURE.rules.x - bounds.x,
              top: FURNITURE.rules.y - bounds.y,
              width: FURNITURE.rules.w,
            }}
          >
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

          {/* Props. They are not notes and never come down: an empty wall is
              still somebody's wall, and a busy one grows out around them. */}
          <figure
            className="wall-photo"
            style={{
              left: FURNITURE.photo.x - bounds.x,
              top: FURNITURE.photo.y - bounds.y,
              width: FURNITURE.photo.w,
            }}
          >
            <span className="pin" aria-hidden="true" />
            <span className="photo-plate" aria-hidden="true">
              <span className="photo-redaction" />
            </span>
            <figcaption>Subject unknown</figcaption>
          </figure>

          <div
            className="wall-map"
            style={{
              left: FURNITURE.map.x - bounds.x,
              top: FURNITURE.map.y - bounds.y,
              width: FURNITURE.map.w,
              height: FURNITURE.map.h,
            }}
            aria-hidden="true"
          >
            <span className="pin" />
            <span className="map-mark" />
          </div>

          {notes.map((n) => (
            <Note
              key={n.id}
              note={n}
              left={n.x - bounds.x}
              top={n.y - bounds.y}
              selected={picked === n.id}
              tying={tying}
              isSource={tyingFrom === n.id}
              onPick={onPick}
              onTie={(id) => {
                setTyingFrom(id);
                setPicked(null);
              }}
            />
          ))}

          <Strings
            edges={edges}
            pins={pins}
            width={bounds.w}
            height={bounds.h}
            originX={bounds.x}
            originY={bounds.y}
            shouldDraw={hasPainted}
          />
          </div>
        </div>
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
        onPinned={(note, from) => {
          setAddedNotes((ns) => [...ns, note]);
          setLanding({ note, from });
          say("Pinned. It is on the wall.");
        }}
        say={say}
      />

      {toast && <div className="toast">{toast}</div>}
      <div className="gate" ref={gate} aria-hidden="true" />
    </div>
  );
}
