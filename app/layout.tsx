import type { Metadata } from "next"
import "./globals.css"
import AppShell from "./AppShell"

export const metadata: Metadata = {
  title: "BSC Control",
  description: "BSC operating system",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}