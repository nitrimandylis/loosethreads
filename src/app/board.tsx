"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { animate } from "animejs";
import { Note } from "./note";
import { Strings } from "./strings";
import { Compose } from "./compose";
import { paperFor } from "@/lib/paper";
import {
  wallBounds,
  landingScale,
  steppedBackScale,
  heartOf,
  pinOf,
  furnitureFrame,
  shotFrame,
  frameVisible,
  fitScale,
  clampScale,
  anchorScroll,
  FURNITURE,
} from "@/lib/wall";
import { mountTurnstile, getToken } from "@/lib/turnstile-client";
import { rememberNote, rememberEdge } from "@/lib/mine";
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
  // Notes this visitor took down (their own): hidden now, gone from the
  // server on the next poll anyway.
  const [downIds, setDownIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const [scale, setScale] = useState(1);
  const [landing, setLanding] = useState<{ note: NoteRow; from: { x: number; y: number } } | null>(
    null
  );

  const notes = useMemo(() => {
    const seen = new Set(served.map((n) => n.id));
    return [...served, ...addedNotes.filter((n) => !seen.has(n.id))].filter(
      (n) => !downIds.has(n.id)
    );
  }, [served, addedNotes, downIds]);

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
    // A downed note takes its strings with it, same as the server join does.
    return out.filter((e) => !downIds.has(e.source_id) && !downIds.has(e.target_id));
  }, [servedEdges, addedEdges, downIds]);

  const bounds = useMemo(() => wallBounds(notes), [notes]);

  // Refs shadow the state the imperative view code reads, because the scale
  // animation runs outside React, frame by frame, and must not see a stale
  // closure. Kept in sync in an effect declared before every effect that
  // reads them, so they are current by the time anything uses them.
  const boundsRef = useRef(bounds);
  const scaleRef = useRef(scale);
  const painted = useRef(false);
  const landed = useRef<number | null>(null);
  // Where the visitor was reading when they pinned, to go back to afterwards.
  const returnTo = useRef<{ s: number; focus: { x: number; y: number } } | null>(null);

  useEffect(() => {
    boundsRef.current = bounds;
    scaleRef.current = scale;
  });

  // A new note can extend the wall past its old left/top edge. Everything is
  // positioned relative to bounds, so when the origin moves, the whole wall
  // would jump under the reader; moving the scroll by the same amount cancels
  // it out. Layout effect so it happens before the browser paints the shift.
  const prevBounds = useRef(bounds);
  useLayoutEffect(() => {
    const prev = prevBounds.current;
    prevBounds.current = bounds;
    const el = scroller.current;
    if (!el || (prev.x === bounds.x && prev.y === bounds.y)) return;
    el.scrollLeft += (prev.x - bounds.x) * scaleRef.current;
    el.scrollTop += (prev.y - bounds.y) * scaleRef.current;
  }, [bounds]);

  /** Has the board painted once? False during the whole first render, true
      before any later one, so reading it while rendering is deterministic:
      it separates "was here on load" from "arrived while reading". */
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

  /** Rescale in place, keeping the board point under (px, py) fixed. px and
      py are offsets inside the scroller's box. Per-frame this only touches
      refs and styles, like view() does; the caller sets state at gesture
      end so React is not re-rendering sixty times a second. */
  const rescale = useCallback((to: number, px: number, py: number) => {
    const el = scroller.current;
    const box = sizer.current;
    const sur = surface.current;
    if (!el || !box || !sur) return;
    const from = scaleRef.current;
    if (to === from) return;
    const b = boundsRef.current;
    box.style.width = `${b.w * to}px`;
    box.style.height = `${b.h * to}px`;
    sur.style.transform = `scale(${to})`;
    sur.style.setProperty("--inv", String(1 / to));
    el.scrollLeft = anchorScroll(el.scrollLeft, px, from, to);
    el.scrollTop = anchorScroll(el.scrollTop, py, from, to);
    scaleRef.current = to;
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

  // First framing. If the landing view would already show the wordmark and
  // the rules card (small wall, wide screen), land straight on it. Otherwise
  // open on the furniture so a stranger reads what this is, hold a beat, then
  // travel to the busiest patch. Any input hands the viewport over.
  useEffect(() => {
    const el = scroller.current;
    if (!el || painted.current) return;
    painted.current = true;

    const b = boundsRef.current;
    const s = landingScale(b, el.clientWidth, el.clientHeight);
    const focus = heartOf(notes, b);

    const settle = (atScale: number) => {
      scaleRef.current = atScale;
      setScale(atScale);
    };

    // Landing already shows the wordmark and the rules: nothing to establish.
    if (frameVisible(furnitureFrame(), s, focus, el.clientWidth, el.clientHeight)) {
      settle(s);
      requestAnimationFrame(() => view(s, focus));
      return;
    }

    const frame = shotFrame(el.clientWidth, el.clientHeight);
    const shotScale = Math.min(1, fitScale(frame, el.clientWidth, el.clientHeight));
    const shotFocus = { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
    settle(shotScale);
    requestAnimationFrame(() => view(shotScale, shotFocus));

    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      // Wherever the travel was when they grabbed, that is now the view.
      setScale(scaleRef.current);
    };
    const inputs = ["pointerdown", "wheel", "keydown", "touchstart"] as const;
    for (const t of inputs) el.addEventListener(t, cancel, { once: true, passive: true });

    const timer = setTimeout(() => {
      if (cancelled) return;
      if (reduced()) {
        settle(s);
        view(s, focus);
        return;
      }
      const proxy = { s: shotScale, x: shotFocus.x, y: shotFocus.y };
      animate(proxy, {
        s,
        x: focus.x,
        y: focus.y,
        duration: 900,
        ease: "inOutQuint",
        onUpdate: () => {
          if (cancelled) return;
          scaleRef.current = proxy.s;
          view(proxy.s, { x: proxy.x, y: proxy.y });
        },
        onComplete: () => {
          if (!cancelled) settle(s);
        },
      });
    }, 700);

    return () => {
      clearTimeout(timer);
      for (const t of inputs) el.removeEventListener(t, cancel);
    };
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

  // Free zoom between the survey scale and 1:1. Ctrl+wheel is also what a
  // trackpad pinch arrives as in Chrome and Firefox; Safari sends gesture
  // events; a phone sends two touches. The step-back button still exists for
  // the named two-step framing. Native listeners, because React registers
  // wheel and touch handlers as passive and preventDefault would be ignored.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    const survey = () =>
      steppedBackScale(boundsRef.current, el.clientWidth, el.clientHeight);
    const settle = () => {
      setScale(scaleRef.current);
      // Keep the step button's label honest after a manual zoom-out.
      setWide(scaleRef.current <= survey() * 1.05);
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // plain wheel keeps scrolling
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const to = clampScale(scaleRef.current * Math.exp(-e.deltaY * 0.01), survey());
      rescale(to, e.clientX - r.left, e.clientY - r.top);
      settle();
    };

    // Safari's trackpad pinch. e.scale is cumulative from gesture start.
    let gestureStart = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStart = scaleRef.current;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      const r = el.getBoundingClientRect();
      const to = clampScale(gestureStart * g.scale, survey());
      rescale(to, g.clientX - r.left, g.clientY - r.top);
    };

    // Two fingers on a phone. Distance ratio drives the scale; the midpoint
    // is the anchor. preventDefault so the browser neither scrolls nor zooms
    // the page while the pinch is live.
    let pinch: { d: number; s: number } | null = null;
    const touchInfo = (e: TouchEvent) => {
      const a = e.touches[0];
      const b = e.touches[1];
      const r = el.getBoundingClientRect();
      return {
        d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        x: (a.clientX + b.clientX) / 2 - r.left,
        y: (a.clientY + b.clientY) / 2 - r.top,
      };
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinch = { d: touchInfo(e).d, s: scaleRef.current };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const t = touchInfo(e);
      rescale(clampScale((pinch.s * t.d) / pinch.d, survey()), t.x, t.y);
    };
    const onTouchEnd = () => {
      if (!pinch) return;
      pinch = null;
      settle();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    el.addEventListener("gestureend", settle);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", settle);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [rescale]);

  /** Your own note travelling from the sheet you wrote it on to the wall. */
  useEffect(() => {
    if (!landing || landed.current === landing.note.id) return;
    landed.current = landing.note.id;
    const { note, from } = landing;

    view(scaleRef.current, { x: note.x + 100, y: note.y + 70 });
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

    let cancelled = false;
    const cancel = () => (cancelled = true);
    const sc = scroller.current;
    sc?.addEventListener("pointerdown", cancel, { once: true, passive: true });

    const timer = setTimeout(() => {
      if (cancelled || !sc) return;
      const here = centreOfView();
      const proxy = { s: scaleRef.current, x: here.x, y: here.y };
      animate(proxy, {
        s: saved.s,
        x: saved.focus.x,
        y: saved.focus.y,
        duration: 700,
        ease: "inOutQuint",
        onUpdate: () => {
          if (cancelled) return;
          scaleRef.current = proxy.s;
          view(proxy.s, { x: proxy.x, y: proxy.y });
        },
        onComplete: () => {
          if (cancelled) return;
          scaleRef.current = saved.s;
          setScale(saved.s);
          requestAnimationFrame(() => view(saved.s, saved.focus));
        },
      });
    }, 760 + 600); // after the landing animation plus a beat

    return () => {
      clearTimeout(timer);
      sc?.removeEventListener("pointerdown", cancel);
    };
  }, [landing, view, centreOfView]);

  const tie = useCallback(
    async (a: number, b: number) => {
      const token = await getToken();
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "edge", sourceId: a, targetId: b, turnstileToken: token }),
      });
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
              settle={hasPainted() && landing?.note.id !== n.id}
              say={say}
              onTakedown={(id) => setDownIds((s) => new Set(s).add(id))}
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
        onPinned={(note, from, secret) => {
          rememberNote(note.id, secret);
          returnTo.current = { s: scaleRef.current, focus: centreOfView() };
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
