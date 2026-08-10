"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LiveNote, LiveEdge } from "@/lib/queries";
import { MAX_BODY } from "@/lib/limits";

function since(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

export function Board({ notes, edges }: { notes: LiveNote[]; edges: LiveEdge[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);

  async function act(kind: "node" | "edge", id: number, action: "edit" | "remove", body?: string) {
    setBusy(`${kind}-${id}`);
    setErr(null);
    const res = await fetch("/api/admin/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id, action, body }),
    });
    setBusy(null);
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: "Failed" }));
      setErr(e.error ?? "Failed");
      return;
    }
    if (action === "edit") {
      setDrafts((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
    }
    router.refresh();
  }

  async function remove(kind: "node" | "edge", id: number, what: string) {
    if (!confirm(`Take this off the board?\n\n${what}`)) return;
    await act(kind, id, "remove");
  }

  return (
    <div className="queue">
      {err && <p className="err">{err}</p>}

      <section>
        <h2>On the board ({notes.length})</h2>
        {notes.length === 0 && <p className="empty">Nothing pinned yet.</p>}
        <div className="qgrid">
          {notes.map((n) => {
            const draft = drafts[n.id];
            const dirty = draft !== undefined && draft.trim() !== n.body;
            const tooLong = (draft ?? n.body).trim().length > MAX_BODY;
            return (
              <div className="qrow" key={n.id}>
                <div className="sticky-note sticky-preview stock-1">
                  {/* same paper layer the public note uses, so the preview is honest */}
                  <div className="paper" aria-hidden="true" />
                  <div className="pin" />
                  <div className="qmeta">
                    <span className="tag">{n.topic}</span>
                    <span className="qage">{since(n.created_at)}</span>
                  </div>
                  <textarea
                    className="qbody-edit"
                    value={draft ?? n.body}
                    aria-label="Note text"
                    onChange={(e) => setDrafts((d) => ({ ...d, [n.id]: e.target.value }))}
                    rows={4}
                  />
                </div>
                <div className="qactions">
                  <button
                    className="ok"
                    disabled={busy === `node-${n.id}` || !dirty || tooLong}
                    onClick={() => act("node", n.id, "edit", draft)}
                  >
                    {tooLong ? "Too long" : "Save edit"}
                  </button>
                  <button
                    className="no"
                    disabled={busy === `node-${n.id}`}
                    onClick={() => remove("node", n.id, n.body)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2>Strings ({edges.length})</h2>
        {edges.length === 0 && <p className="empty">Nothing tied together yet.</p>}
        {edges.map((e) => (
          <div className="qrow" key={e.id}>
            <p className="qbody">
              <em>&ldquo;{e.source_body}&rdquo;</em> ↔ <em>&ldquo;{e.target_body}&rdquo;</em>
            </p>
            <div className="qactions">
              <button
                className="no"
                disabled={busy === `edge-${e.id}`}
                onClick={() => remove("edge", e.id, `${e.source_body} ↔ ${e.target_body}`)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export function SignOut() {
  const router = useRouter();
  return (
    <button
      className="signout"
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" });
        router.refresh();
      }}
    >
      Sign out
    </button>
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
