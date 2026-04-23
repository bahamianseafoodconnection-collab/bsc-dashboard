"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { name: "Dashboard", path: "/" },
    { name: "Bills", path: "/bills" },
    { name: "Inventory", path: "/inventory" },
    { name: "POS", path: "/pos" },
    { name: "Cash", path: "/cash" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#f8fafc",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          background: "linear-gradient(90deg, #2f86c7, #1b4f72)",
          color: "white",
          padding: "18px",
          fontWeight: "bold",
          fontSize: "22px",
          textAlign: "center",
          letterSpacing: "1px",
        }}
      >
        BSC CONTROL
      </div>

      {/* MAIN CONTENT */}
      <div
        style={{
          flex: 1,
          padding: "20px",
          maxWidth: "900px",
          width: "100%",
          margin: "0 auto",
        }}
      >
        {children}
      </div>

      {/* BOTTOM NAV */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          borderTop: "1px solid #ddd",
          padding: "12px 0",
          background: "#ffffff",
          position: "sticky",
          bottom: 0,
        }}
      >
        {tabs.map((tab) => (
          <Link key={tab.path} href={tab.path}>
            <span
              style={{
                fontSize: "14px",
                color: pathname === tab.path ? "#2f86c7" : "#777",
                fontWeight: pathname === tab.path ? "bold" : "normal",
                cursor: "pointer",
              }}
            >
              {tab.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}