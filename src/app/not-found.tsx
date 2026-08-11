import Link from "next/link";

/**
 * A typo'd address. Same reasoning as error.tsx: the stock Next 404 is a
 * generated-looking page on a board whose whole claim is that it was made by
 * hand at 2am, and it costs one card to say so in the right voice.
 */
export default function NotFound() {
  return (
    <main className="board stray">
      <aside className="wall-rules stray-card">
        <span className="pin" aria-hidden="true" />
        <h2>Nothing pinned here</h2>
        <p>Whatever was at this address is not on the wall. It may never have been.</p>
        <p className="rules-foot">
          <Link className="pin-btn stray-btn" href="/">
            Back to the wall
          </Link>
        </p>
      </aside>
    </main>
  );
}
