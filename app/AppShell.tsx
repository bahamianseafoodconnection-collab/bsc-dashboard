"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export default function AppShell({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const navItems = [
    { href: "/", label: "Dashboard", icon: "🏠" },
    { href: "/bills", label: "Bills", icon: "💡" },
    { href: "/inventory", label: "Inventory", icon: "📦" },
    { href: "/pos", label: "POS", icon: "🧾" },
    { href: "/cash", label: "Cash", icon: "💵" },
  ]

  return (
    <div className="app-container">
      <div className="header">BSC CONTROL</div>

      <div className="main-content">{children}</div>

      <nav className="bottom-nav">
        {navItems.map((item) => {
          const active = pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${active ? "active" : ""}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}