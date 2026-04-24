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
      {/* Header */}
      <div className="bg-[#0a1729] border-b border-white/10 p-6 sticky top-0 z-50">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-amber-400 tracking-tighter">BSC Control</h1>
            <p className="text-white/60 mt-1">Nassau Marketplace • April 24, 2026</p>
          </div>
          <div className="text-right text-green-400 font-medium">OPEN • 7 Cashiers</div>
        </div>
      </div>

      <div className="p-6 space-y-8 max-w-5xl mx-auto">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
            <div className="text-white/60 text-sm">Today&apos;s Revenue</div>
            <div className="text-4xl font-bold mt-3">${summary.revenue.toLocaleString()}</div>
            <div className="text-green-400 text-sm mt-2">↑ 18.4%</div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
            <div className="text-white/60 text-sm">BSC Keeps (7%)</div>
            <div className="text-4xl font-bold text-amber-400 mt-3">${summary.bscKeeps.toFixed(2)}</div>
            <div className="text-amber-400 text-sm mt-1">Profit Today</div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
            <div className="text-white/60 text-sm">Supplier Owed (93%)</div>
            <div className="text-4xl font-bold mt-3">${summary.supplierOwed.toFixed(2)}</div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
            <div className="text-white/60 text-sm">Transactions</div>
            <div className="text-4xl font-bold mt-3">{summary.transactions}</div>
            <div className="text-white/60 text-sm mt-1">Avg $143.45</div>
          </div>
        </div>

        {/* Inventory Alert */}
        <div className="bg-red-900/20 border border-red-500/30 rounded-3xl p-6">
          <div className="flex items-start gap-3">
            <span className="text-3xl">⚠️</span>
            <div>
              <h3 className="font-semibold text-red-400">Inventory Alerts</h3>
              <p className="text-white/90">{summary.lowStockItems} items below minimum stock</p>
              <Link href="/inventory" className="text-amber-400 hover:underline text-sm mt-3 inline-block">
                View full inventory →
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Sales */}
        <div>
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-semibold text-xl">Recent Sales</h3>
            <Link href="/report" className="text-amber-400 hover:underline">All Reports →</Link>
          </div>

          <div className="space-y-4">
            {recentSales.map((sale) => (
              <div key={sale.id} className="bg-white/5 border border-white/10 rounded-3xl p-5 flex justify-between items-center">
                <div>
                  <div className="font-mono text-amber-400 text-lg">{sale.id}</div>
                  <div className="text-white/70 text-sm mt-1">{sale.time} • {sale.customer}</div>
                </div>
                <div className="text-right font-bold text-2xl text-white">
                  ${sale.total}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Link 
            href="/pos" 
            className="bg-gradient-to-br from-amber-400 to-yellow-500 text-black rounded-3xl py-10 text-center font-bold text-2xl active:scale-95 shadow-xl shadow-amber-500/30"
          >
            Open POS
          </Link>
          <Link 
            href="/report" 
            className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-3xl py-10 text-center font-semibold text-xl active:scale-95 transition-all"
          >
            View All Invoices
          </Link>
        </div>
      </div>
    </div>
  );
}