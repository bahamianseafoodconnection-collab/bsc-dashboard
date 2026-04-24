"use client";

import { useEffect, useState } from "react";
import { getFinancialSummary } from "../lib/finance";

export default function DashboardPage() {
  const [data, setData] = useState({
    revenue: 0,
    profit: 0,
    supplierOwed: 0,
    transactions: 0,
  });

  function loadData() {
    const summary = getFinancialSummary();
    setData(summary);
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>BSC CONTROL — Dashboard</h1>

      <h2>Today Overview</h2>

      <div style={{ marginBottom: 20 }}>
        <h3>Revenue</h3>
        <p>${data.revenue.toFixed(2)}</p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h3>Profit (BSC 7%)</h3>
        <p>${data.profit.toFixed(2)}</p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h3>Owed to Supplier (93%)</h3>
        <p>${data.supplierOwed.toFixed(2)}</p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h3>Transactions</h3>
        <p>{data.transactions}</p>
      </div>

      <button onClick={loadData}>
        Refresh Dashboard
      </button>
    </div>
  );
}