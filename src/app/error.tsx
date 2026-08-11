"use client";

import { useEffect } from "react";

/**
 * What a visitor sees when the board cannot be read.
 *
 * Design Principle 1 says any state somebody can land on should be worth
 * screenshotting, and this is the only state whose timing nobody controls: a
 * database blip picks its own moment. Left alone it is Next's white
 * "Application error" page, which is the single most generated-looking thing
 * this project could ever put on a screen.
 *
 * So it is a card pinned to an empty wall, in the board's own voice and using
 * the board's own cork and paper rather than a second visual language.
 *
 * `unstable_retry` rather than `reset`: this Next version offers both, and
 * reset only clears the error state without re-fetching. A blip needs the
 * re-fetch, or "Try again" just paints the same failure back.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // No error reporting service here on purpose: the function log is the
    // whole observability story, and the digest is what ties this screen to a
    // line in it.
    console.error(error);
  }, [error]);

  return (
    <main className="board stray">
      <aside className="wall-rules stray-card">
        <span className="pin" aria-hidden="true" />
        <h2>The wall came down</h2>
        <p>Something behind the board stopped answering. This one is not your fault.</p>
        <p>
          <strong>Nothing is lost.</strong> The wall is kept somewhere else and comes back
          when it does.
        </p>
        <p className="rules-foot">
          <button className="pin-btn stray-btn" onClick={() => unstable_retry()}>
            Try again
          </button>
        </p>
        {error.digest && <p className="stray-ref">ref {error.digest}</p>}
      </aside>
    </main>
  );
}
