// File: app/invoice/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getInvoices } from "../../lib/invoices";

function InvoiceContent() {
  const searchParams = useSearchParams();
  const invoiceId = searchParams.get("id");
  const invoices = getInvoices();
  const invoice = invoices.find((inv) => inv.id === invoiceId);

  if (!invoice) {
    return (
      <div style={{
        padding: 30,
        backgroundColor: "#0a0f1e",
        minHeight: "100vh",
        color: "#fff",
        fontFamily: "sans-serif"
      }}>
        <h2 style={{ color: "#f87171" }}>❌ Invoice Not Found</h2>
        <p style={{ color: "#aaa" }}>ID: {invoiceId}</p>
        <p style={{ color: "#555", fontSize: 13 }}>
          Invoices reset on page refresh until Supabase is connected.
        </p>
        <button
          onClick={() => window.history.back()}
          style={{
            marginTop: 20,
            padding: "12px 20px",
            borderRadius: 10,
            backgroundColor: "#f5c518",
            color: "#000",
            fontWeight: "bold",
            border: "none",
            cursor: "pointer",
            fontSize: 15
          }}
        >
          ← Back to POS
        </button>
      </div>
    );
  }

  return (
    <div style={{
      padding: 24,
      backgroundColor: "#0a0f1e",
      minHeight: "100vh",
      color: "#fff",
      fontFamily: "sans-serif",
      maxWidth: 480,
      margin: "0 auto"
    }}>

      {/* HEADER */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{ color: "#f5c518", margin: 0, fontSize: 22 }}>
          BSC MARKETPLACE
        </h1>
        <p style={{ color: "#aaa", margin: "4px 0", fontSize: 13 }}>
          Bahamian Seafood Connection
        </p>
        <p style={{ color: "#555", fontSize: 12 }}>{invoice.date}</p>
      </div>

      {/* INVOICE ID */}
      <div style={{
        backgroundColor: "#1a2235",
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
        border: "1px solid #2a3550",
        textAlign: "center"
      }}>
        <p style={{ margin: 0, color: "#aaa", fontSize: 12 }}>Invoice ID</p>
        <p style={{
          margin: "4px 0",
          fontWeight: "bold",
          fontSize: 14,
          color: "#f5c518",
          wordBreak: "break-all"
        }}>
          {invoice.id}
        </p>
      </div>

      {/* CUSTOMER */}
      <div style={{
        backgroundColor: "#1a2235",
        borderRadius: 10,
        padding: 14,
        marginBottom: 16,
        border: "1px solid #2a3550"
      }}>
        <p style={{ margin: "2px 0", color: "#aaa", fontSize: 12 }}>
          Customer
        </p>
        <p style={{ margin: "4px 0", fontWeight: "bold", fontSize: 16 }}>
          {invoice.customerName}
        </p>
        <p style={{ margin: "2px 0", color: "#60a5fa", fontSize: 13 }}>
          📱 {invoice.customerPhone}
        </p>
      </div>

      {/* ITEMS */}
      <h3 style={{ color: "#f5c518", marginBottom: 10 }}>Items Purchased</h3>
      {invoice.items.map((item, i) => (
        <div key={i} style={{
          backgroundColor: "#1a2235",
          borderRadius: 10,
          padding: 12,
          marginBottom: 10,
          border: "1px solid #2a3550"
        }}>
          <p style={{ margin: "2px 0", fontWeight: "bold" }}>
            {item.productName}
          </p>
          <p style={{ margin: "2px 0", color: "#aaa", fontSize: 13 }}>
            {item.qty} × ${item.price.toFixed(2)}
          </p>
          <p style={{ margin: "2px 0", color: "#4ade80", fontWeight: "bold" }}>
            ${item.total.toFixed(2)}
          </p>
        </div>
      ))}

      {/* TOTAL */}
      <div style={{
        backgroundColor: "#0f1f0f",
        border: "2px solid #4ade80",
        borderRadius: 12,
        padding: 16,
        marginTop: 8,
        marginBottom: 24,
        textAlign: "center"
      }}>
        <p style={{ margin: 0, color: "#aaa", fontSize: 13 }}>Total Paid</p>
        <h2 style={{ margin: "6px 0 0", color: "#4ade80", fontSize: 28 }}>
          ${invoice.total.toFixed(2)}
        </h2>
      </div>

      {/* PRINT */}
      <button
        onClick={() => window.print()}
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: 10,
          backgroundColor: "#f5c518",
          color: "#000",
          fontWeight: "bold",
          border: "none",
          fontSize: 16,
          cursor: "pointer",
          marginBottom: 12
        }}
      >
        🖨️ Print Invoice
      </button>

      {/* BACK */}
      <button
        onClick={() => window.history.back()}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: 10,
          backgroundColor: "#1a2235",
          color: "#aaa",
          border: "1px solid #2a3550",
          fontSize: 15,
          cursor: "pointer"
        }}
      >
        ← Back to POS
      </button>

      {/* FOOTER */}
      <p style={{
        textAlign: "center",
        color: "#333",
        fontSize: 11,
        marginTop: 30
      }}>
        BSC Marketplace System · Thank you for your business
      </p>
    </div>
  );
}

export default function InvoicePage() {
  return (
    <Suspense fallback={
      <div style={{
        padding: 30,
        backgroundColor: "#0a0f1e",
        minHeight: "100vh",
        color: "#fff"
      }}>
        Loading invoice...
      </div>
    }>
      <InvoiceContent />
    </Suspense>
  );
}
