'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function Dashboard() {
  const [summary] = useState({
    revenue: 12480.75,
    bscKeeps: 873.65,
    supplierOwed: 7862.88,
    transactions: 87,
    lowStockItems: 7,
  });

  const recentSales = [
    { id: 'INV-238491', time: 'Today 2:34 PM', customer: 'Sarah Smith', total: 184.97 },
    { id: 'INV-238490', time: 'Today 1:12 PM', customer: 'John Doe', total: 79.99 },
    { id: 'INV-238489', time: 'Yesterday', customer: 'Michael Johnson', total: 342.50 },
  ];

  return (
    <div className="min-h-screen bg-[#0a1729] text-white pb-28">
      {/* Top Header */}
      <div className="sticky top-0 z-50 bg-[#0a1729] border-b border-white/10 p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-amber-400 tracking-tighter">BSC Control</h1>
            <p className="text-white/60 mt-1">Nassau Marketplace • April 24, 2026</p>
          </div>
          <div className="px-4 py-2 bg-green-500/10 text-green-400 rounded-2xl text-sm font-medium">
            OPEN • 7 Cashiers
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8 max-w-5xl mx-auto">
        {/* KPI Cards - Clean Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Revenue */}
          <div className="bg-gradient-to-br from-white/5 to-white/10 border border-white/10 rounded-3xl p-6">
            <div className="text-white/60 text-sm mb-1">Today&apos;s Revenue</div>
            <div className="text-4xl font-bold tracking-tight">${summary.revenue.toLocaleString()}</div>
            <div className="flex items-center gap-2 text-green-400 text-sm mt-3">
              ↑ 18.4% from yesterday
            </div>
          </div>

          {/* BSC Keeps */}
          <div className="bg-gradient-to-br from-amber-400/10 to-amber-500/10 border border-amber-400/20 rounded-3xl p-6">
            <div className="text-amber-400/70 text-sm mb-1">BSC Keeps (7%)</div>
            <div className="text-4xl font-bold text-amber-400 tracking-tight">${summary.bscKeeps.toFixed(2)}</div>
            <div className="text-amber-400 text-sm mt-3">Profit Today</div>
          </div>

          {/* Supplier Owed */}
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 col-span-2 md:col-span-1">
            <div className="text-white/60 text-sm mb-1">Supplier Owed (93%)</div>
            <div className="text-4xl font-bold tracking-tight">${summary.supplierOwed.toFixed(2)}</div>
          </div>

          {/* Transactions */}
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 col-span-2 md:col-span-1">
            <div className="text-white/60 text-sm mb-1">Transactions</div>
            <div className="text-4xl font-bold tracking-tight">{summary.transactions}</div>
            <div className="text-white/60 text-sm mt-1">Avg ${Math.round(summary.revenue / summary.transactions)}</div>
          </div>
        </div>

        {/* Inventory Alert */}
        <div className="bg-red-950/50 border border-red-500/30 rounded-3xl p-6 flex gap-4 items-start">
          <div className="text-4xl mt-1">⚠️</div>
          <div className="flex-1">
            <h3 className="font-semibold text-red-400 text-lg">Inventory Alert</h3>
            <p className="text-white/90 mt-1">{summary.lowStockItems} items below minimum stock level</p>
            <Link 
              href="/inventory" 
              className="inline-block mt-4 text-amber-400 hover:text-amber-300 font-medium"
            >
              Manage Inventory →
            </Link>
          </div>
        </div>

        {/* Recent Sales */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-semibold">Recent Sales</h3>
            <Link href="/report" className="text-amber-400 hover:underline text-sm font-medium">All Reports →</Link>
          </div>

          <div className="space-y-3">
            {recentSales.map((sale) => (
              <div key={sale.id} className="bg-white/5 border border-white/10 rounded-3xl p-5 flex justify-between items-center hover:border-white/30 transition-colors">
                <div>
                  <div className="font-mono text-amber-400 font-medium">{sale.id}</div>
                  <div className="text-white/70 text-sm mt-1">{sale.time} • {sale.customer}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">${sale.total}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-2 gap-4 pt-4">
          <Link 
            href="/pos"
            className="bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 text-black font-bold text-2xl py-10 rounded-3xl flex items-center justify-center active:scale-95 shadow-2xl shadow-amber-500/40 transition-all"
          >
            Open POS
          </Link>
          <Link 
            href="/report"
            className="bg-white/10 hover:bg-white/20 border border-white/20 font-semibold text-xl py-10 rounded-3xl flex items-center justify-center active:scale-95 transition-all"
          >
            View All Invoices
          </Link>
        </div>
      </div>
    </div>
  );
}