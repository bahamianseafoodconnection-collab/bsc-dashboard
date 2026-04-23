import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BSC CONTROL",
  description: "BSC Marketplace Control System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#f3f4f6",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            margin: "0 auto",
            minHeight: "100vh",
            background: "#ffffff",
            position: "relative",
            boxShadow: "0 0 8px rgba(0,0,0,0.08)",
          }}
        >
          <header
            style={{
              background: "#4a90e2",
              padding: "28px 20px",
            }}
          >
            <div
              style={{
                color: "#ffffff",
                fontSize: "34px",
                fontWeight: 700,
                letterSpacing: "1px",
              }}
            >
              BSC CONTROL
            </div>
          </header>

          <main
            style={{
              padding: "32px 20px 110px 20px",
            }}
          >
            {children}
          </main>

          <nav
            style={{
              position: "fixed",
              bottom: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "100%",
              maxWidth: "480px",
              background: "#ffffff",
              borderTop: "1px solid #d1d5db",
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
              padding: "10px 4px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ textAlign: "center", fontSize: "16px" }}>🏠<br />Dashboard</div>
            <div style={{ textAlign: "center", fontSize: "16px" }}>💡<br />Bills</div>
            <div style={{ textAlign: "center", fontSize: "16px" }}>📦<br />Inventory</div>
            <div style={{ textAlign: "center", fontSize: "16px" }}>🧾<br />POS</div>
            <div style={{ textAlign: "center", fontSize: "16px" }}>💵<br />Cash</div>
          </nav>
        </div>
      </body>
    </html>
  );
}