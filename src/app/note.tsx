"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
import { rememberStampProof, noteSecret, forgetNote } from "@/lib/mine";
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
