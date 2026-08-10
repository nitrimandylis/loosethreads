import { isAdmin } from "@/lib/admin";
import { getLiveBoard } from "@/lib/queries";
import { Board, Login, SignOut } from "./queue-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return (
      <main className="admin">
        <h1>Moderation</h1>
        <Login />
      </main>
    );
  }
  const { notes, edges } = await getLiveBoard();
  return (
    <main className="admin">
      <div className="admin-head">
        <h1>What is on the board</h1>
        <SignOut />
      </div>
      <p className="admin-note">
        Everything here is already public. Editing rewrites it in place; removing takes it down
        immediately.
      </p>
      <Board notes={notes} edges={edges} />
    </main>
  );
}
