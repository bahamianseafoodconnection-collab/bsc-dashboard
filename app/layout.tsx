import type { Metadata } from "next";
import AppShell from "./AppShell";

export const metadata: Metadata = {
  title: "BSC Control",
  description: "BSC Control Dashboard",
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