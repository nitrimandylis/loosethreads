"use client";

import { useState, useSyncExternalStore } from "react";
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
  onPick,
  onTie,
}: {
  note: NoteRow;
  left: number;
  top: number;
  selected: boolean;
  tying: boolean;
  isSource: boolean;
  onPick: (id: number) => void;
  onTie: (id: number) => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>(note.reactions ?? {});
  const stamped = useSyncExternalStore(subscribe, getStamped, getServerStamped);
  const mine = (kind: string) => isStamped(stamped, note.id, kind);

  const paper = paperFor(note.id, note.body.length);
  const age = ageBucket(note.created_at);
  const earned = STAMPS.filter((s) => counts[s]);

  async function react(kind: string) {
    if (mine(kind)) return;
    setCounts((c) => ({ ...c, [kind]: (c[kind] ?? 0) + 1 })); // optimistic
    rememberStamp(note.id, kind);

    const ok = await fetch("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "reaction", nodeId: note.id, kind }),
    })
      .then((r) => r.ok)
      .catch(() => false);

    // Don't leave a count showing a vote the server never took.
    if (!ok) {
      setCounts((c) => ({ ...c, [kind]: Math.max(0, (c[kind] ?? 1) - 1) }));
      forgetStamp(note.id, kind);
    }
  }

  const classes = [
    "note",
    `stock-${paper.stock}`,
    `age-${age}`,
    selected ? "picked" : "",
    tying ? "tyable" : "",
    isSource ? "string-end" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={classes}
      data-note-id={note.id}
      tabIndex={0}
      aria-label={tying ? `Tie string to: ${note.body}` : note.body}
      style={
        {
          left,
          top,
          width: paper.width,
          "--tilt": `${paper.tilt}deg`,
          "--pin-shift": `${paper.pinShift}px`,
        } as React.CSSProperties
      }
      onClick={() => onPick(note.id)}
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

      <p className="body">{note.body}</p>

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

      {selected && !tying && (
        <div className="tray" onClick={(e) => e.stopPropagation()}>
          {STAMPS.map((s) => (
            <button
              key={s}
              className={`tray-stamp${mine(s) ? " used" : ""}`}
              disabled={mine(s)}
              onClick={() => react(s)}
              aria-label={mine(s) ? `${s}, already stamped by you` : `Stamp ${s}`}
            >
              {s}
            </button>
          ))}
          <button className="tray-tie" onClick={() => onTie(note.id)}>
            Tie string
          </button>
        </div>
      )}
    </article>
  );
}
