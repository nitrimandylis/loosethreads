import Script from "next/script";
import Canvas from "./canvas";
import { getApprovedBoard } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { notes, edges } = await getApprovedBoard();
  const hasTurnstile = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  return (
    <main>
      {hasTurnstile && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      )}
      <header className="topbar">
        <h1>Loose Threads</h1>
        <span>anonymous gossip · connect the dots</span>
      </header>
      <Canvas notes={notes} edges={edges} />
    </main>
  );
}
