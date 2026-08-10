"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PendingNote, PendingEdge } from "@/lib/queries";

export function Queue({ notes, edges }: { notes: PendingNote[]; edges: PendingEdge[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<number, string>>(
    () => Object.fromEntries(notes.map((n) => [n.id, n.body]))
  );

  async function decide(kind: "node" | "edge", id: number, action: "approve" | "reject") {
    setBusy(`${kind}-${id}`);
    const payload: Record<string, unknown> = { kind, id, action };
    if (kind === "node" && action === "approve") {
      payload.body = bodies[id] ?? "";
    }
    await fetch("/api/admin/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="queue">
      <section>
        <h2>Notes ({notes.length})</h2>
        {notes.length === 0 && <p className="empty">Nothing pending.</p>}
        <div className="qgrid">
          {notes.map((n) => (
            <div className="qrow" key={n.id}>
              <div className="sticky-note sticky-preview stock-1">
                {/* same paper layer the public note uses, so the preview is honest */}
                <div className="paper" aria-hidden="true" />
                <div className="pin" />
                <div className="qmeta">
                  <span className="tag">{n.topic}</span>
                </div>
                <textarea
                  className="qbody-edit"
                  value={bodies[n.id] ?? n.body}
                  onChange={(e) =>
                    setBodies((prev) => ({ ...prev, [n.id]: e.target.value }))
                  }
                  rows={4}
                />
              </div>
              <div className="qactions">
                <button
                  className="ok"
                  disabled={busy === `node-${n.id}`}
                  onClick={() => decide("node", n.id, "approve")}
                >
                  Approve
                </button>
                <button
                  className="no"
                  disabled={busy === `node-${n.id}`}
                  onClick={() => decide("node", n.id, "reject")}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Connections ({edges.length})</h2>
        {edges.length === 0 && <p className="empty">Nothing pending.</p>}
        {edges.map((e) => (
          <div className="qrow" key={e.id}>
            <p className="qbody">
              <em>&ldquo;{e.source_body}&rdquo;</em> ↔ <em>&ldquo;{e.target_body}&rdquo;</em>
            </p>
            <div className="qactions">
              <button className="ok" disabled={busy === `edge-${e.id}`} onClick={() => decide("edge", e.id, "approve")}>
                Approve
              </button>
              <button className="no" disabled={busy === `edge-${e.id}`} onClick={() => decide("edge", e.id, "reject")}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export function Login() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState("");

  async function login() {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    if (res.ok) router.refresh();
    else setErr("Wrong secret.");
  }

  return (
    <div className="login">
      <input
        type="password"
        value={secret}
        placeholder="Admin secret"
        aria-label="Admin secret"
        onChange={(e) => setSecret(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && login()}
      />
      <button onClick={login}>Enter</button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
