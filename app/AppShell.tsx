"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { name: "Dashboard", icon: "🏠", path: "/" },
    { name: "Bills", icon: "💡", path: "/bills" },
    { name: "Inventory", icon: "📦", path: "/inventory" },
    { name: "POS", icon: "🧾", path: "/pos" },
    { name: "Cash", icon: "💵", path: "/cash" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f7f8fb" }}>
      <header
        style={{
          background: "#2f86c7",
          color: "white",
          padding: "18px 16px",
          fontWeight: 800,
          fontSize: "22px",
          textAlign: "center",
          letterSpacing: "1px",
        }}
      >
        BSC CONTROL
      </header>

      <main
        style={{
          padding: "16px",
          paddingBottom: "96px",
          maxWidth: "920px",
          margin: "0 auto",
        }}
      >
        {children}
      </main>

      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          borderTop: "1px solid #ddd",
          background: "#ffffff",
          padding: "8px 0 calc(8px + env(safe-area-inset-bottom))",
        }}
      >
        {tabs.map((tab) => {
          const active = pathname === tab.path;

          return (
            <Link
              key={tab.path}
              href={tab.path}
              style={{
                textDecoration: "none",
                color: active ? "#2f86c7" : "#333",
                fontWeight: active ? 800 : 500,
                textAlign: "center",
                fontSize: "13px",
                lineHeight: 1.2,
              }}
            >
              <div style={{ fontSize: "18px", marginBottom: "3px" }}>{tab.icon}</div>
              <div>{tab.name}</div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}