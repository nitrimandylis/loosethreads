import Board from "./board";
import { getApprovedBoard } from "@/lib/queries";
import { demoBoard } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // /?demo=1 puts a fixed board up without a database, for looking at the
  // design and for re-shooting the link preview. Development only.
  const demo = process.env.NODE_ENV !== "production" && (await searchParams).demo === "1";
  const { notes, edges } = demo ? demoBoard() : await getApprovedBoard();

  return (
    <main>
      {/* The title and the rules are pinned to the wall itself, not floated
          over it: the only thing allowed to hover above the board is the one
          action that puts something on it. */}
      <Board notes={notes} edges={edges} />
    </main>
  );
}
