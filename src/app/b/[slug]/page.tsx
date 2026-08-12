import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Board from "../../board";
import { Gate } from "../../gate";
import { boardAccess } from "@/lib/access";
import { getApprovedBoard } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * A private board. The slug gets somebody to this page; the passphrase gets
 * them past it.
 *
 * The locked branch renders the Gate INSTEAD of the Board, not over it, so a
 * locked board has no rumours anywhere in its HTML for someone to read out of
 * view-source.
 */

// The link lands in a group chat, and the chat renders a preview of it before
// anybody has typed a word. So a private board describes itself and nothing
// else: no title from the wall, no rendered image of its notes, and out of
// search on top of the site-wide robots rule.
export const metadata: Metadata = {
  title: "A board",
  description: "A private board.",
  openGraph: { title: "A board", description: "A private board.", images: [] },
  robots: { index: false, follow: false },
};

export default async function PrivateBoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await boardAccess(slug);

  // A malformed slug, an invented one and a deleted one are one answer.
  if (!access) notFound();

  if (!access.unlocked) {
    return (
      <main>
        <Gate slug={slug} />
      </main>
    );
  }

  const { notes, edges } = await getApprovedBoard(access.board.id);
  return (
    <main>
      <Board notes={notes} edges={edges} />
    </main>
  );
}
