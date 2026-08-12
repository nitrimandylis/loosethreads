"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * What a private board looks like before you are on it.
 *
 * Design Principle 1 says every state a visitor can land on is worth
 * screenshotting, and a locked board is a state a lot of people will land on
 * first. So it is the wall, with an envelope pinned to it, in the same flat
 * case-file voice as everything else, rather than a login box.
 *
 * There are no notes behind it because there are none in the response: the
 * page renders this INSTEAD of the board, not on top of it.
 */
export function Gate({ slug }: { slug: string }) {
  const router = useRouter();
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!word.trim() || busy) return;
    setBusy(true);
    setError("");

    const res = await fetch("/api/board/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, passphrase: word }),
    }).catch(() => null);
    setBusy(false);

    if (res?.ok) {
      // The cookie is set; ask the server component to render again, which it
      // now does with the board in it.
      router.refresh();
      return;
    }
    const data = await res?.json().catch(() => ({}));
    setError(data?.error || "That did not open it.");
    setWord("");
  }

  return (
    <div className="board gate-wall">
      {/* Design Principle 3, zero context required: without the wordmark a
          stranger who was forwarded this link lands on an anonymous card on
          brown cork with no way to tell what any of it is. It also stops the
          locked board being one object centred on an empty wall, which is the
          most generated-looking state the app could have. */}
      <header className="wall-head gate-head">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <h1>Loose Threads</h1>
        <p>anonymous gossip · connect the dots</p>
      </header>

      <form className="gate" onSubmit={submit}>
        <span className="pin" aria-hidden="true" />
        <h1>Restricted</h1>
        <p className="gate-blurb">
          This board is not the public one. It opens with a word, and the word was given to
          somebody in person.
        </p>
        <label className="gate-field">
          <span>Passphrase</span>
          {/* No autoFocus: on a phone it throws the keyboard up over the wall
              before anybody has seen what they landed on, and the focus ring
              on arrival reads as a rejection of a word not yet typed. */}
          <input
            type="password"
            value={word}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setWord(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "gate-error" : undefined}
          />
        </label>
        <button type="submit" disabled={busy || !word.trim()}>
          {busy ? "Checking" : "Identify"}
        </button>
        {/* Colour is never the only carrier: the failure is words, and it is
            announced, because the input it refers to is a password field a
            screen reader will not read back. */}
        {error && (
          <p className="gate-error" id="gate-error" role="status">
            {error}
          </p>
        )}
        <p className="gate-foot">If you were not given the word, you were not meant to be here.</p>
      </form>
    </div>
  );
}
