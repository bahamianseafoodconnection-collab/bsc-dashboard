'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface Summary {
  revenue: number;
  profit: number;
  bscKeeps: number;
  supplierOwed: number;
  transactions: number;
  lowStockItems: number;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary>({
    revenue: 12480.75,
    profit: 8736.53,
    bscKeeps: 873.65,
    supplierOwed: 7862.88,
    transactions: 87,
    lowStockItems: 7,
  });

  const [recentSales] = useState([
    { id: 'INV-238491', time: 'Today 2:34 PM', customer: 'Sarah Smith', total: 184.97 },
    { id: 'INV-238490', time: 'Today 1:12 PM', customer: 'John Doe', total: 79.99 },
    { id: 'INV-238489', time: 'Yesterday', customer: 'Michael Johnson', total: 342.50 },
  ]);

  return (
    <div className="min-h-screen bg-[#0a1729] text-white pb-24">
      {/* Top Header */}
      <div className="bg-[#0a1729] border-b border-white/10 p-6 sticky top-0 z-50">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-amber-400 tracking-tighter">BSC Control</h1>
            <p className="text-white/60 mt-1">Nassau Marketplace • April 24, 2026</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-green-400">OPEN • 7 Cashiers</div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8 max-w-5xl mx-auto">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
            <div className="text-white/60 text-sm">Today's Revenue</div>
            <div className="text-4xl font-bold text-white mt-3">${summary.revenue.toLocaleString()}</div>
            <div className="text-green-400 text-sm mt-2 flex items-center gap-1">↑ 18.4%</div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
            <div className="text-white/60 text-sm">BSC Keeps (7%)</div>
            <div className="text-4xl font-bold text-amber-400 mt-3">${summary.bscKeeps.toFixed(2)}</div>
            <div className="text-amber-400 text-sm mt-2">Profit Today</div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
            <div className="text-white/60 text-sm">Supplier Owed (93%)</div>
            <div className="text-4xl font-bold text-white mt-3">${summary.supplierOwed.toFixed(2)}</div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
            <div className="text-white/60 text-sm">Transactions</div>
            <div className="text-4xl font-bold text-white mt-3">{summary.transactions}</div>
            <div className="text-white/60 text-sm mt-2">Avg $143.45</div>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-red-900/20 border border-red-500/30 rounded-3xl p-6">
          <div className="flex items-center gap-3 text-red-400 mb-4">
            <span className="text-2xl">⚠️</span>
            <h3 className="font-semibold">Inventory Alerts • {summary.lowStockItems} items below minimum</h3>
          </div>
          <Link href="/inventory" className="text-amber-400 hover:underline text-sm">
            View full inventory →
          </Link>
        </div>

        {/* Recent Sales */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg">Recent Sales</h3>
            <Link href="/report" className="text-amber-400 text-sm hover:underline">All Reports →</Link>
          </div>
          <div className="space-y-3">
            {recentSales.map((sale) => (
              <div key={sale.id} className="bg-white/5 border border-white/10 rounded-3xl p-5 flex justify-between items-center">
                <div>
                  <div className="font-mono text-amber-400">{sale.id}</div>
                  <div className="text-white/70 text-sm mt-1">{sale.time} • {sale.customer}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-xl">${sale.total}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-4 pt-4">
          <Link href="/pos" className="bg-gradient-to-br from-amber-400 to-yellow-500 text-black rounded-3xl p-8 text-center font-bold text-2xl active:scale-95 transition-transform">
            → Open POS
          </Link>
          <Link href="/report" className="bg-white/10 hover:bg-white/15 border border-white/20 rounded-3xl p-8 text-center font-medium text-xl transition-all">
            View All Invoices
          </Link>
        </div>
      </div>

      {/* Bottom Nav Placeholder (will be in AppShell) */}
      <div className="h-20" />
    </div>
  );
}