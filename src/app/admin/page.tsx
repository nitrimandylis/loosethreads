import { isAdmin } from "@/lib/admin";
import { getQueue } from "@/lib/queries";
import { Queue, Login } from "./queue-client";

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
  const { notes, edges } = await getQueue();
  return (
    <main className="admin">
      <h1>Moderation queue</h1>
      <Queue notes={notes} edges={edges} />
    </main>
  );
}
