import "./globals.css"
import AppShell from "./AppShell"
import type { ReactNode } from "react"

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}