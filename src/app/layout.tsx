import type { Metadata } from "next";
import { Kalam, Courier_Prime } from "next/font/google";
import "./globals.css";

// Two faces, one contrast axis: felt-tip on paper vs typed case file.
// Self-hosted by next/font so the board looks the same on every device —
// the old stack asked for "Bradley Hand", which only exists on macOS and
// fell back to Comic Sans on Windows.
const hand = Kalam({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  display: "swap",
});

const typewriter = Courier_Prime({
  variable: "--font-type",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Loose Threads",
  description: "Anonymous gossip — pin it, connect the dots, watch the threads come loose.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${hand.variable} ${typewriter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
