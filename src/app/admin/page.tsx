import { isAdmin } from "@/lib/admin";
import { getLiveBoard } from "@/lib/queries";
import { boardBySlug, listBoards, PUBLIC_SLUG, validSlug } from "@/lib/boards";
import { ensureSchema } from "@/lib/db";
import { Board, Boards, Login, SignOut } from "./queue-client";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isAdmin())) {
    return (
      <main className="admin">
        <h1>Moderation</h1>
        <Login />
      </main>
    );
  }

  await ensureSchema();

  // ?board=<slug> switches walls. No passphrase is asked for: the admin secret
  // already outranks it, since it can edit and remove on any board anyway.
  const asked = (await searchParams).board;
  const slug = typeof asked === "string" && validSlug(asked) ? asked : PUBLIC_SLUG;
  const board = await boardBySlug(slug);
  const boards = await listBoards();

  if (!board) {
    return (
      <main className="admin">
        <h1>Moderation</h1>
        <Boards boards={boards} current={PUBLIC_SLUG} />
        <p className="admin-note">No such board.</p>
      </main>
    );
  }

  const { notes, edges } = await getLiveBoard(board.id);
  const where = slug === PUBLIC_SLUG ? "the public wall" : `/b/${slug}`;

  return (
    <main className="admin">
      <div className="admin-head">
        <h1>What is on {where}</h1>
        <SignOut />
      </div>
      <p className="admin-note">
        Everything here is already public to whoever can reach the board. Editing rewrites it in
        place; removing takes it down immediately.
      </p>
      <Boards boards={boards} current={slug} />
      <Board notes={notes} edges={edges} />
    </main>
  );
}
