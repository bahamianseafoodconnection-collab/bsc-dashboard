"use client";

export default function Page() {
  return (
    <div>
      <h1
        style={{
          margin: "0 0 24px 0",
          fontSize: "30px",
          fontWeight: 700,
          color: "#0b1533",
        }}
      >
        Dashboard
      </h1>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "18px",
          padding: "24px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        <h2
          style={{
            margin: "0 0 16px 0",
            fontSize: "22px",
            fontWeight: 700,
            color: "#0b1533",
          }}
        >
          Supplier Chat Module
        </h2>

        <p
          style={{
            margin: 0,
            fontSize: "18px",
            lineHeight: 1.5,
            color: "#111827",
          }}
        >
          Module temporarily disabled for clean system rebuild.
        </p>
      </div>
    </div>
  );
}