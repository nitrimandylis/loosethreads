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
                <div className="note note-preview stock-1">
                  {/* same paper layer the public note uses, so the preview is honest */}
                  <div className="paper" aria-hidden="true" />
                  <div className="pin" />
                  <div className="qmeta">
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

/**
 * Every board, and the controls for the private ones.
 *
 * This console covers all of them, which is a decision with a consequence:
 * whoever holds ADMIN_SECRET can read and take down anything on a private
 * board. A board is private from the internet, not from the person who owns
 * the database.
 */
export function Boards({
  boards,
  current,
}: {
  boards: { slug: string; created_at: string; notes: number }[];
  current: string;
}) {
  const router = useRouter();
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [made, setMade] = useState("");

  async function send(body: Record<string, unknown>): Promise<{ slug?: string } | null> {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/boards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      setErr(data?.error ?? "Failed.");
      return null;
    }
    return data ?? {};
  }

  async function create() {
    const data = await send({ action: "create", passphrase: word });
    if (!data?.slug) return;
    setMade(data.slug);
    setWord("");
    router.refresh();
  }

  async function rekey(slug: string) {
    const next = prompt(`New passphrase for /b/${slug}. Everyone inside has to be told it.`);
    if (!next) return;
    if (await send({ action: "passphrase", slug, passphrase: next })) router.refresh();
  }

  async function rotate(slug: string) {
    if (!confirm(`Sign everyone out of /b/${slug}?\n\nThe passphrase still works.`)) return;
    if (await send({ action: "rotate", slug })) router.refresh();
  }

  return (
    <section className="boards">
      <h2>Boards</h2>
      {err && <p className="err">{err}</p>}

      <div className="board-list">
        {boards.map((b) => {
          const label = b.slug === "" ? "the public wall" : `/b/${b.slug}`;
          return (
            <div className={`board-row${b.slug === current ? " on" : ""}`} key={b.slug || "public"}>
              <a href={b.slug === "" ? "/admin" : `/admin?board=${b.slug}`}>{label}</a>
              <span className="board-count">{b.notes} notes</span>
              {b.slug !== "" && (
                <span className="board-acts">
                  <button disabled={busy} onClick={() => rekey(b.slug)}>
                    New passphrase
                  </button>
                  <button disabled={busy} onClick={() => rotate(b.slug)}>
                    Sign everyone out
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="board-new">
        <input
          type="text"
          value={word}
          placeholder="Passphrase for a new board"
          aria-label="Passphrase for a new board"
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && word.trim() && create()}
        />
        <button disabled={busy || !word.trim()} onClick={create}>
          Make a board
        </button>
      </div>

      {made && (
        <p className="board-made">
          Made <strong>/b/{made}</strong>. Send someone that link and the word, separately.
        </p>
      )}
    </section>
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
