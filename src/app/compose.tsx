"use client";

import { useRef, useState } from "react";
import { TOPICS } from "@/lib/topics";
import { MAX_BODY } from "@/lib/limits";
import { getToken } from "@/lib/turnstile-client";
import type { NoteRow } from "@/lib/queries";

/**
 * You write on the note itself.
 *
 * A blank sheet comes up from the bottom of the wall and what you type on it is
 * literally what gets pinned: same paper, same handwriting, same size. The old
 * version was a dark card with a textarea and a select in it, which is the one
 * surface in the app that looked like every other app.
 */
export function Compose({
  onPinned,
  say,
}: {
  onPinned: (note: NoteRow, from: { x: number; y: number }) => void;
  say: (message: string) => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [topic, setTopic] = useState(TOPICS[0].id);
  const [busy, setBusy] = useState(false);

  const left = MAX_BODY - body.length;

  async function pin() {
    setBusy(true);
    const token = await getToken();
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body, topic, turnstileToken: token }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok || !data.note) {
      say(data.error || "That did not go up. Try again.");
      return;
    }

    // Where the sheet is on screen right now, so the note can travel from here
    // to its place on the wall instead of blinking into existence.
    const r = sheet.current?.getBoundingClientRect();
    const from = r
      ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight };

    onPinned(data.note as NoteRow, from);
    setBody("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="pin-btn" onClick={() => setOpen(true)}>
        Pin a rumour
      </button>
    );
  }

  return (
    <div className="compose" role="dialog" aria-label="Write a rumour">
      <div className="compose-sheet" ref={sheet}>
        <span className="pin" aria-hidden="true" />
        <button className="compose-close" onClick={() => setOpen(false)} aria-label="Put it down">
          ✕
        </button>

        <textarea
          className="compose-body"
          value={body}
          maxLength={MAX_BODY}
          placeholder="Spill it…"
          aria-label="The rumour"
          onChange={(e) => setBody(e.target.value)}
          autoFocus
        />

        <div className={`compose-left${left < 60 ? " tight" : ""}`}>{left} left on the paper</div>

        <div className="compose-tabs" role="radiogroup" aria-label="Where it goes">
          {TOPICS.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={topic === t.id}
              className={`tab${topic === t.id ? " on" : ""}`}
              onClick={() => setTopic(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button className="compose-pin" disabled={busy || !body.trim()} onClick={pin}>
          {busy ? "Pinning…" : "Pin it"}
        </button>
        <p className="compose-hint">Anonymous. It goes up the second you pin it.</p>
      </div>
    </div>
  );
}
