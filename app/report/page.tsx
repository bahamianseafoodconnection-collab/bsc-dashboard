"use client";

import { getInvoices } from "../../lib/invoices";

export default function ReportPage() {
  const invoices = getInvoices();

  function handlePrint() {
    window.print();
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Invoices</h1>

      {invoices.length === 0 && <p>No invoices yet</p>}

      {invoices.map((inv) => (
        <div
          key={inv.id}
          style={{
            border: "1px solid #ccc",
            padding: 15,
            marginBottom: 20,
            borderRadius: 8,
          }}
        >
          <h3>{inv.id}</h3>
          <p>Date: {inv.date}</p>
          <p>
            <b>Customer:</b> {inv.customerName}
          </p>
          <p>
            <b>Phone:</b> {inv.customerPhone}
          </p>

          <hr />

          {inv.items.map((item, i) => (
            <div key={i}>
              <p>
                {item.productName} — {item.qty} × ${item.price}
              </p>
              <p>Item Total: ${item.total}</p>
            </div>
          ))}

          <hr />

          <h2>Total: ${inv.total.toFixed(2)}</h2>

          <button onClick={handlePrint}>Print Invoice</button>
        </div>
      ))}
    </div>
  );
}