"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { STAMPS } from "@/lib/reactions";
import { ageBucket } from "@/lib/aging";
import { paperFor } from "@/lib/paper";
import {
  subscribe,
  getStamped,
  getServerStamped,
  isStamped,
  rememberStamp,
  forgetStamp,
} from "@/lib/stamped";
import {
  rememberStampProof,
  stampProof,
  forgetStampProof,
  noteSecret,
  forgetNote,
} from "@/lib/mine";
import { MAX_BODY } from "@/lib/limits";
import type { NoteRow } from "@/lib/queries";

/** Stamps are ink on paper, and 👀 needs a class name a stylesheet can hold. */
const SLUGS: Record<string, string> = {
  CONFIRMED: "confirmed",
  CAP: "cap",
  "👀": "eyes",
  LMAO: "lmao",
};

export function Note({
  note,
  left,
  top,
  selected,
  tying,
  isSource,
  settle,
  say,
  scaleOf,
  onMoved,
  onTakedown,
  onPick,
  onTie,
}: {
  note: NoteRow;
  left: number;
  top: number;
  selected: boolean;
  tying: boolean;
  isSource: boolean;
  /** True when this note arrived after the board painted (someone else's
      rumour landing mid-read): it settles in instead of popping. */
  settle: boolean;
  say: (message: string) => void;
  /** Current board zoom, for turning a screen drag into board coordinates. */
  scaleOf: () => number;
  /** A drag ended here: the browser keeps the note at (x, y) locally. */
  onMoved: (id: number, x: number, y: number) => void;
  onTakedown: (id: number) => void;
  onPick: (id: number) => void;
  onTie: (id: number) => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>(note.reactions ?? {});
  // Rewording your own note happens on the note itself: the body becomes a
  // textarea on the same paper. The reworded text shows immediately and the
  // next poll serves the same thing back.
  const [editing, setEditing] = useState(false);
  const [reworded, setReworded] = useState<string | null>(null);
  const body = reworded ?? note.body;
  const secret = noteSecret(note.id);
  const [settling, setSettling] = useState(settle);
  useEffect(() => {
    if (!settling) return;
    const t = setTimeout(() => setSettling(false), 600);
    return () => clearTimeout(t);
    // Mount only: a note settles once, when it first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const stamped = useSyncExternalStore(subscribe, getStamped, getServerStamped);
  const mine = (kind: string) => isStamped(stamped, note.id, kind);

  const paper = paperFor(note.id, note.body.length);
  const age = ageBucket(note.created_at);
  const earned = STAMPS.filter((s) => counts[s]);

  // ---- pull the pin out and move the note (this browser's view only) ----
  // Mouse: drag it directly, a move past 6px is a drag rather than a click.
  // Touch: hold 450ms to lift, then drag; a plain swipe keeps scrolling the
  // board, which is how phones scroll a busy wall.
  const article = useRef<HTMLElement>(null);
  // Gesture handlers are attached once; they read the current mode here.
  const mode = useRef({ tying, editing });
  useEffect(() => {
    mode.current = { tying, editing };
  });
  // Set when a drag just ended, so the click that follows does not open the
  // tray on a note somebody was only moving.
  const dragged = useRef(false);
  const grab = useRef<{ sx: number; sy: number; dx: number; dy: number; on: boolean } | null>(null);

  const follow = (dxScreen: number, dyScreen: number) => {
    const el = article.current;
    if (!el) return;
    const s = scaleOf();
    // The note lives inside the scaled surface, so screen px shrink by the
    // zoom before they become board px.
    grab.current!.dx = dxScreen / s;
    grab.current!.dy = dyScreen / s;
    el.style.translate = `${grab.current!.dx}px ${grab.current!.dy}px`;
  };

  const commitMove = () => {
    const g = grab.current;
    const el = article.current;
    grab.current = null;
    if (!g || !el) return;
    el.classList.remove("lifted");
    if (!g.on) return;
    el.style.translate = "";
    dragged.current = true;
    onMoved(note.id, note.x + g.dx, note.y + g.dy);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if (mode.current.tying || mode.current.editing) return;
    if ((e.target as HTMLElement).closest("button, textarea")) return;
    grab.current = { sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, on: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.on && Math.hypot(dx, dy) > 6) {
      g.on = true;
      article.current?.classList.add("lifted");
    }
    if (g.on) follow(dx, dy);
  };

  // Touch needs native listeners: preventDefault inside a passive handler
  // (which React uses for touch) is ignored, and the browser would scroll.
  useEffect(() => {
    const el = article.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;
    let lifted = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || mode.current.tying || mode.current.editing) return;
      if ((e.target as HTMLElement).closest("button, textarea")) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      lifted = false;
      timer = setTimeout(() => {
        lifted = true;
        grab.current = { sx: start!.x, sy: start!.y, dx: 0, dy: 0, on: true };
        el.classList.add("lifted");
      }, 450);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!start) return;
      if (e.touches.length !== 1) {
        // A second finger means a pinch, not a lift.
        if (timer) clearTimeout(timer);
        start = null;
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (lifted) {
        e.preventDefault(); // the note moves, not the board
        follow(dx, dy);
        return;
      }
      // Moving before the hold fires is a scroll; let the board have it.
      if (Math.hypot(dx, dy) > 8 && timer) {
        clearTimeout(timer);
        timer = null;
        start = null;
      }
    };
    const onTouchEnd = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      start = null;
      if (lifted) commitMove();
      lifted = false;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
    // Attached once; everything mutable is read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function react(kind: string) {
    if (mine(kind)) return;
    setCounts((c) => ({ ...c, [kind]: (c[kind] ?? 0) + 1 })); // optimistic
    rememberStamp(note.id, kind);

    const data = await fetch("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "reaction", nodeId: note.id, kind }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    // Don't leave a count showing a vote the server never took.
    if (!data) {
      setCounts((c) => ({ ...c, [kind]: Math.max(0, (c[kind] ?? 1) - 1) }));
      forgetStamp(note.id, kind);
      return;
    }
    // The proof is what lets this browser take the stamp back later.
    rememberStampProof(note.id, kind, data.id, data.secret);
  }

  // The mirror of react(): take a stamp of yours back off the note.
  async function unreact(kind: string) {
    const proof = stampProof(note.id, kind);
    if (!proof) return;
    setCounts((c) => ({ ...c, [kind]: Math.max(0, (c[kind] ?? 1) - 1) })); // optimistic
    forgetStamp(note.id, kind);

    const ok = await fetch("/api/manage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unstamp", id: proof.id, secret: proof.secret }),
    })
      .then((r) => r.ok)
      .catch(() => false);

    if (ok) {
      forgetStampProof(note.id, kind);
    } else {
      // The stamp is still on the server; put it back on the note.
      setCounts((c) => ({ ...c, [kind]: (c[kind] ?? 0) + 1 }));
      rememberStamp(note.id, kind);
    }
  }

  const classes = [
    "note",
    `stock-${paper.stock}`,
    `age-${age}`,
    selected ? "picked" : "",
    tying ? "tyable" : "",
    isSource ? "string-end" : "",
    settling ? "settling" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      ref={article}
      className={classes}
      data-note-id={note.id}
      tabIndex={0}
      aria-label={tying ? `Tie string to: ${body}` : body}
      style={
        {
          left,
          top,
          width: paper.width,
          "--tilt": `${paper.tilt}deg`,
          "--pin-shift": `${paper.pinShift}px`,
        } as React.CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={commitMove}
      onPointerCancel={commitMove}
      onClick={() => {
        // The click at the end of a drag is the hand letting go, not a pick.
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        onPick(note.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(note.id);
        }
      }}
    >
      {/* The stock itself. Kept separate from the content so aging can yellow
          the paper without draining the colour out of the ink or the pin. */}
      <span className="paper" aria-hidden="true" />
      <span className="pin" aria-hidden="true" />

      {editing ? (
        <textarea
          className="body body-edit"
          defaultValue={body}
          maxLength={MAX_BODY}
          autoFocus
          aria-label="Reword the rumour"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.currentTarget.value = body; // put it back, then blur saves nothing
              setEditing(false);
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          onBlur={async (e) => {
            const next = e.target.value.trim();
            setEditing(false);
            if (!next || next === body || !secret) return;
            const res = await fetch("/api/manage", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "reword", id: note.id, secret, body: next }),
            }).catch(() => null);
            if (res?.ok) setReworded(next);
            else say("The reword did not take.");
          }}
        />
      ) : (
        <p className="body">{body}</p>
      )}

      {/* Landed stamps are impressions, not buttons: at rest a note carries no
          UI at all, so a screenshot of the wall has none in it either. */}
      {earned.length > 0 && (
        <p className="marks">
          {earned.map((s) => (
            <span key={s} className={`mark mark-${SLUGS[s] ?? "other"}`}>
              {s}
              {counts[s] > 1 && <b>&times;{counts[s]}</b>}
            </span>
          ))}
        </p>
      )}

      {selected && !tying && !editing && (
        <div className="tray" onClick={(e) => e.stopPropagation()}>
          {STAMPS.map((s) => {
            const yours = mine(s);
            // Stamped before proofs existed: still locked, like it always was.
            const reversible = yours && stampProof(note.id, s) !== null;
            return (
              <button
                key={s}
                className={`tray-stamp${yours ? " used" : ""}`}
                disabled={yours && !reversible}
                onClick={() => (yours ? unreact(s) : react(s))}
                aria-label={
                  yours
                    ? reversible
                      ? `${s}, stamped by you. Take it back`
                      : `${s}, already stamped by you`
                    : `Stamp ${s}`
                }
              >
                {s}
              </button>
            );
          })}
          <button className="tray-tie" onClick={() => onTie(note.id)}>
            Tie string
          </button>
          {/* Yours to manage, proven by the secret this browser was handed
              when it pinned the note. Nobody else sees these. */}
          {secret && (
            <>
              <button
                className="tray-own"
                onClick={async () => {
                  const res = await fetch("/api/manage", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ action: "takedown", id: note.id, secret }),
                  }).catch(() => null);
                  if (res?.ok) {
                    forgetNote(note.id);
                    onTakedown(note.id);
                    say("Taken down.");
                  } else {
                    say("That would not come down.");
                  }
                }}
              >
                Take down
              </button>
              <button className="tray-own" onClick={() => setEditing(true)}>
                Reword
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
