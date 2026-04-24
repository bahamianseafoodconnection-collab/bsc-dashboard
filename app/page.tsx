"use client";

import { useEffect, useState } from "react";
import { getFinancials } from "../lib/finance";

type DashboardData = {
  revenue: number;
  profit: number;
  supplierOwed: number;
  transactions: number;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    revenue: 0,
    profit: 0,
    supplierOwed: 0,
    transactions: 0,
  });

  function loadData() {
    const summary = getFinancials();

    setData({
      revenue: summary.revenue ?? 0,
      profit: summary.profit ?? 0,
      supplierOwed: summary.supplierOwed ?? 0,
      transactions: summary.transactions ?? 0,
    });
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>BSC CONTROL</h1>
      <h2>Dashboard</h2>

      <p>Revenue: ${data.revenue.toFixed(2)}</p>
      <p>Profit: ${data.profit.toFixed(2)}</p>
      <p>Owed to Supplier: ${data.supplierOwed.toFixed(2)}</p>
      <p>Transactions: {data.transactions}</p>

      <button onClick={loadData}>Refresh Dashboard</button>
    </div>
  );
}