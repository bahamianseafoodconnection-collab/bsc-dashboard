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
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      
      {/* Header */}
      <div
        style={{
          background: "#2f86c7",
          color: "white",
          padding: "16px",
          fontWeight: "bold",
          fontSize: "20px",
          textAlign: "center",
        }}
      >
        BSC CONTROL
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: "16px" }}>
        {children}
      </div>

      {/* Bottom Nav */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          borderTop: "1px solid #ddd",
          padding: "10px 0",
          background: "#fff",
          position: "sticky",
          bottom: 0,
        }}
      >
        {tabs.map((tab) => (
          <Link key={tab.path} href={tab.path}>
            <span
              style={{
                color: pathname === tab.path ? "#2f86c7" : "#777",
                fontWeight: pathname === tab.path ? "bold" : "normal",
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