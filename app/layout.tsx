// File: app/layout.tsx
import type { Metadata } from "next";
import AppShell from "./AppShell";

export const metadata: Metadata = {
  title: "BSC Marketplace — Fresh. Local. Bahamian.",
  description: "Bahamian Seafood Connection — Nassau & Andros. Fresh seafood, local food, vehicle listings, and bill payments across the Bahamas.",
  authors: [{ name: "Dedrick Storr Snr" }],
  creator: "Bahamian Seafood Connection",
  publisher: "BSC Marketplace",
  keywords: ["Bahamas seafood", "Nassau food delivery", "Bahamian marketplace", "BSC", "Andros delivery"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
