"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PendingNote, PendingEdge } from "@/lib/queries";

export function Queue({ notes, edges }: { notes: PendingNote[]; edges: PendingEdge[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(kind: "node" | "edge", id: number, action: "approve" | "reject") {
    setBusy(`${kind}-${id}`);
    await fetch("/api/admin/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id, action }),
    });
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="queue">
      <section>
        <h2>Notes ({notes.length})</h2>
        {notes.length === 0 && <p className="empty">Nothing pending.</p>}
        {notes.map((n) => (
          <div className="qrow" key={n.id}>
            <div className="qmeta">
              <span className="tag">{n.topic}</span>
              {n.triage && (
                <span className={`risk r${Math.min(9, n.triage.risk)}`}>
                  risk {n.triage.risk} · {n.triage.categories.join(", ")}
                </span>
              )}
            </div>
            <p className="qbody">{n.body}</p>
            {n.triage?.reason && <p className="qreason">🤖 {n.triage.reason}</p>}
            <div className="qactions">
              <button className="ok" disabled={busy === `node-${n.id}`} onClick={() => decide("node", n.id, "approve")}>
                Approve
              </button>
              <button className="no" disabled={busy === `node-${n.id}`} onClick={() => decide("node", n.id, "reject")}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2>Connections ({edges.length})</h2>
        {edges.length === 0 && <p className="empty">Nothing pending.</p>}
        {edges.map((e) => (
          <div className="qrow" key={e.id}>
            <p className="qbody">
              <em>“{e.source_body}”</em> ↔ <em>“{e.target_body}”</em>
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
      <h2>Moderator</h2>
      <input
        type="password"
        value={secret}
        placeholder="Admin secret"
        onChange={(e) => setSecret(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && login()}
      />
      <button onClick={login}>Enter</button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
