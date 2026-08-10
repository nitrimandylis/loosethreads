import type { Metadata } from "next";
import { Kalam, Courier_Prime } from "next/font/google";
import "./globals.css";

// Two faces, one contrast axis: felt-tip on paper vs typed case file.
// Self-hosted by next/font so the board looks the same on every device. The
// old stack asked for "Bradley Hand", which only exists on macOS and
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

// The link gets pasted into group chats, so the preview card is the first
// thing most people ever see of this. opengraph-image.png next to this file is
// picked up by convention; metadataBase makes it resolve to an absolute URL.
const site = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "Loose Threads",
  description: "Anonymous gossip: pin it, connect the dots, watch the threads come loose.",
  openGraph: {
    type: "website",
    siteName: "Loose Threads",
    title: "Loose Threads",
    description: "An infinite corkboard of anonymous rumours, tied together with red string.",
  },
  twitter: { card: "summary_large_image" },
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
