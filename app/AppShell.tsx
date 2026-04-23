"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/bills", label: "Bills", icon: "💡" },
  { href: "/inventory", label: "Inventory", icon: "📦" },
  { href: "/pos", label: "POS", icon: "🧾" },
  { href: "/cash", label: "Cash", icon: "💵" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <header
        style={{
          background: "#4a9be8",
          color: "white",
          padding: "28px 24px",
          fontSize: 34,
          fontWeight: 900,
          letterSpacing: 2,
        }}
      >
        BSC CONTROL
      </header>

      <div style={{ paddingBottom: 96 }}>{children}</div>

      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: 78,
          background: "white",
          borderTop: "1px solid #d1d5db",
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          zIndex: 9999,
        }}
      >
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                textDecoration: "none",
                color: active ? "#2563eb" : "#111827",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                fontWeight: active ? 800 : 500,
                gap: 4,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}