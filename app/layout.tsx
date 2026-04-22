import "./globals.css"
import AppShell from "./AppShell"

export const metadata = {
  title: "BSC CONTROL",
  description: "BSC Control Dashboard",
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