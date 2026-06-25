// File: app/report/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchInvoicesFromDB, type Invoice } from "../../lib/invoices";
import Link from "next/link";

const POS_MARGIN = 0.38;
const MARKET_MARGIN = 0.25;
const WHOLESALE_MARGIN = 0.15;

function getInvoiceType(inv: Invoice): 'pos' | 'delivery' | 'pickup' | 'wholesale' {
  const name = inv.customerName.toUpperCase();
  if (name.includes('DELIVERY')) return 'delivery';
  if (name.includes('PICKUP')) return 'pickup';
  if (name.includes('WHOLESALE')) return 'wholesale';
  return 'pos';
}

function getMargin(type: 'pos' | 'delivery' | 'pickup' | 'wholesale'): number {
  if (type === 'delivery' || type === 'pickup') return MARKET_MARGIN;
  if (type === 'wholesale') return WHOLESALE_MARGIN;
  return POS_MARGIN;
}

function getTypeLabel(type: 'pos' | 'delivery' | 'pickup' | 'wholesale') {
  if (type === 'delivery') return { label: 'Online Delivery', color: '#60a5fa', icon: '🚚' };
  if (type === 'pickup')   return { label: 'Online Pickup',  color: '#a78bfa', icon: '📦' };
  if (type === 'wholesale') return { label: 'Wholesale',     color: '#f5c518', icon: '📦' };
  return { label: 'POS Store', color: '#4ade80', icon: '🛒' };
}

type Tab = 'summary' | 'invoices' | 'breakdown';
type Period = 'today' | 'week' | 'month' | 'all';

function isToday(dateStr: string): boolean {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return dateStr === today;
}

function isThisWeek(dateStr: string): boolean {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= weekAgo && d <= now;
  } catch { return false; }
}

function isThisMonth(dateStr: string): boolean {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  } catch { return false; }
}

export default function ReportPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>('summary');
  const [period, setPeriod] = useState<Period>('today');
  const [isControlAdmin, setIsControlAdmin] = useState(false);

  useEffect(() => {
    async function load() {
      const data = await fetchInvoicesFromDB();
      setInvoices(data);
      setLoading(false);
    }
    load();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('role').eq('id', user.id).single().then(({ data }) => {
        if (data?.role === 'control_admin') setIsControlAdmin(true);
      });
    });
  }, []);

  const periodFiltered = invoices.filter(inv => {
    if (period === 'today') return isToday(inv.date);
    if (period === 'week')  return isThisWeek(inv.date);
    if (period === 'month') return isThisMonth(inv.date);
    return true;
  });

  const searchFiltered = periodFiltered.filter(inv =>
    inv.customerName.toLowerCase().includes(search.toLowerCase()) ||
    inv.id.toLowerCase().includes(search.toLowerCase())
  );

  const posInvoices      = periodFiltered.filter(inv => getInvoiceType(inv) === 'pos');
  const deliveryInvoices = periodFiltered.filter(inv => getInvoiceType(inv) === 'delivery');
  const pickupInvoices   = periodFiltered.filter(inv => getInvoiceType(inv) === 'pickup');
  const wholesaleInvoices = periodFiltered.filter(inv => getInvoiceType(inv) === 'wholesale');

  const posRevenue      = posInvoices.reduce((s, i) => s + i.total, 0);
  const deliveryRevenue = deliveryInvoices.reduce((s, i) => s + i.total, 0);
  const pickupRevenue   = pickupInvoices.reduce((s, i) => s + i.total, 0);
  const wholesaleRevenue = wholesaleInvoices.reduce((s, i) => s + i.total, 0);

  const posProfit      = posRevenue * POS_MARGIN;
  const deliveryProfit = deliveryRevenue * MARKET_MARGIN;
  const pickupProfit   = pickupRevenue * MARKET_MARGIN;
  const wholesaleProfit = wholesaleRevenue * WHOLESALE_MARGIN;

  const totalRevenue = posRevenue + deliveryRevenue + pickupRevenue + wholesaleRevenue;
  const totalProfit  = posProfit + deliveryProfit + pickupProfit + wholesaleProfit;
  const totalOrders  = periodFiltered.length;
  const avgOrder     = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const allTimeRevenue = invoices.reduce((s, i) => s + i.total, 0);
  const allTimeProfit  = invoices.reduce((s, i) => s + i.total * getMargin(getInvoiceType(i)), 0);

  const pg: React.CSSProperties = {
    padding: 16, backgroundColor: '#060d1f', minHeight: '100vh',
    color: '#fff', fontFamily: 'sans-serif', paddingBottom: 100,
    maxWidth: 700, margin: '0 auto',
  };
  const card: React.CSSProperties = {
    backgroundColor: '#0d1f3c', borderRadius: 14, padding: '14px 16px',
    border: '1px solid #1e3a5f', marginBottom: 12,
  };

  if (loading) return (
    <div style={{ ...pg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 40, marginBottom: 12 }}>📊</p>
        <p style={{ color: '#4a5568', fontSize: 14 }}>Loading reports...</p>
      </div>
    </div>
  );

  return (
    <div style={pg}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          {isControlAdmin && (
            <button onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '1px solid #f5c518', borderRadius: 10, color: '#f5c518', fontWeight: 'bold', fontSize: 12, cursor: 'pointer', padding: '7px 14px', marginBottom: 10 }}>
              ← BSC Control
            </button>
          )}
          <h1 style={{ margin: 0, color: '#f5c518', fontSize: 20, fontWeight: 'bold' }}>📊 Profit Tracker</h1>
          <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>BSC Marketplace · All channels</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 18 }}>${allTimeProfit.toFixed(2)}</p>
          <p style={{ margin: 0, color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>ALL TIME PROFIT</p>
        </div>
      </div>

      {/* PERIOD SELECTOR */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['today', 'week', 'month', 'all'] as Period[]).map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold', backgroundColor: period === p ? '#f5c518' : '#0d1f3c', color: period === p ? '#000' : '#6b7280' }}>
            {p === 'today' ? 'Today' : p === 'week' ? '7 Days' : p === 'month' ? 'Month' : 'All Time'}
          </button>
        ))}
      </div>

      {/* KPI STRIP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'REVENUE',   value: '$' + totalRevenue.toFixed(2), color: '#4ade80' },
          { label: 'PROFIT',    value: '$' + totalProfit.toFixed(2),  color: '#f5c518' },
          { label: 'ORDERS',    value: String(totalOrders),           color: '#60a5fa' },
          { label: 'AVG ORDER', value: '$' + avgOrder.toFixed(2),     color: '#a78bfa' },
        ].map(kpi => (
          <div key={kpi.label} style={{ backgroundColor: '#0d1f3c', borderRadius: 12, padding: '10px 8px', border: '1px solid #1e3a5f', textAlign: 'center' as const }}>
            <p style={{ margin: 0, color: '#4a5568', fontSize: 8, letterSpacing: 1 }}>{kpi.label}</p>
            <p style={{ margin: '5px 0 0', color: kpi.color, fontWeight: 'bold', fontSize: 13 }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([
          { key: 'summary',   label: '📈 Summary'  },
          { key: 'breakdown', label: '🏪 Channels' },
          { key: 'invoices',  label: '🧾 Invoices' },
        ] as { key: Tab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 'bold', backgroundColor: tab === t.key ? '#f5c518' : '#0d1f3c', color: tab === t.key ? '#000' : '#6b7280' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* SUMMARY TAB */}
      {tab === 'summary' && (
        <>
          {totalOrders === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: 40 }}>
              <p style={{ fontSize: 40, marginBottom: 10 }}>📭</p>
              <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>No sales {period === 'today' ? 'today' : period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'yet'}</p>
              <p style={{ margin: '8px 0 0', color: '#4a5568', fontSize: 13 }}>Completed POS and marketplace sales will appear here.</p>
            </div>
          ) : (
            <>
              <div style={card}>
                <p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Profit by Channel</p>
                {[
                  { label: 'POS / Physical Store', revenue: posRevenue,      profit: posProfit,      margin: '38%', count: posInvoices.length,      icon: '🛒', color: '#4ade80' },
                  { label: 'Online Delivery',       revenue: deliveryRevenue, profit: deliveryProfit, margin: '25%', count: deliveryInvoices.length,  icon: '🚚', color: '#60a5fa' },
                  { label: 'Online Pickup',         revenue: pickupRevenue,   profit: pickupProfit,   margin: '25%', count: pickupInvoices.length,    icon: '📦', color: '#a78bfa' },
                  { label: 'Wholesale',             revenue: wholesaleRevenue,profit: wholesaleProfit,margin: '15%', count: wholesaleInvoices.length, icon: '📦', color: '#f5c518' },
                ].map(channel => (
                  <div key={channel.label} style={{ backgroundColor: '#060d1f', borderRadius: 12, padding: '12px 14px', marginBottom: 8, border: '1px solid #1e3a5f' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18 }}>{channel.icon}</span>
                        <div>
                          <p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{channel.label}</p>
                          <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{channel.count} orders · {channel.margin} margin</p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, color: '#fff', fontSize: 13 }}>${channel.revenue.toFixed(2)}</p>
                        <p style={{ margin: 0, color: channel.color, fontWeight: 'bold', fontSize: 13 }}>+${channel.profit.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', borderRadius: 12, padding: '14px 16px', border: '1px solid #f5c51833', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Total BSC Profit</p>
                    <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>{totalOrders} orders · ${totalRevenue.toFixed(2)} revenue</p>
                  </div>
                  <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 24 }}>${totalProfit.toFixed(2)}</p>
                </div>
              </div>
              <div style={card}>
                <p style={{ margin: '0 0 12px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>BSC Margin Reference</p>
                {[
                  { channel: 'POS Physical Store',  margin: '38%',    note: 'Walk-in customers',    color: '#4ade80' },
                  { channel: 'Retail Online Market',   margin: '25%',    note: 'Delivery + Pickup',    color: '#60a5fa' },
                  { channel: 'Wholesale / Bulk',     margin: '15%',    note: 'Business orders 10lb+',color: '#f5c518' },
                  { channel: 'Utility Bills',        margin: '$5 + 5%',note: 'Service fee',          color: '#a78bfa' },
                ].map(r => (
                  <div key={r.channel} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1e3a5f' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13 }}>{r.channel}</p>
                      <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{r.note}</p>
                    </div>
                    <span style={{ backgroundColor: '#060d1f', color: r.color, border: '1px solid ' + r.color, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 'bold' }}>{r.margin}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* BREAKDOWN TAB */}
      {tab === 'breakdown' && (
        <>
          <div style={card}>
            <p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Revenue by Channel</p>
            {[
              { label: 'POS Store',      revenue: posRevenue,       profit: posProfit,       count: posInvoices.length,       pct: totalRevenue > 0 ? posRevenue / totalRevenue * 100 : 0,       color: '#4ade80' },
              { label: 'Online Delivery',revenue: deliveryRevenue,  profit: deliveryProfit,  count: deliveryInvoices.length,  pct: totalRevenue > 0 ? deliveryRevenue / totalRevenue * 100 : 0,  color: '#60a5fa' },
              { label: 'Online Pickup',  revenue: pickupRevenue,    profit: pickupProfit,    count: pickupInvoices.length,    pct: totalRevenue > 0 ? pickupRevenue / totalRevenue * 100 : 0,    color: '#a78bfa' },
              { label: 'Wholesale',      revenue: wholesaleRevenue, profit: wholesaleProfit, count: wholesaleInvoices.length, pct: totalRevenue > 0 ? wholesaleRevenue / totalRevenue * 100 : 0, color: '#f5c518' },
            ].map(ch => (
              <div key={ch.label} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{ch.label}</p>
                    <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{ch.count} orders</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, color: '#fff', fontSize: 13 }}>${ch.revenue.toFixed(2)}</p>
                    <p style={{ margin: 0, color: ch.color, fontSize: 11, fontWeight: 'bold' }}>+${ch.profit.toFixed(2)} profit</p>
                  </div>
                </div>
                <div style={{ backgroundColor: '#060d1f', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: ch.pct + '%', height: '100%', backgroundColor: ch.color, borderRadius: 6, transition: 'width 0.5s' }} />
                </div>
                <p style={{ margin: '3px 0 0', color: '#4a5568', fontSize: 10 }}>{ch.pct.toFixed(1)}% of revenue</p>
              </div>
            ))}
          </div>
          <div style={card}>
            <p style={{ margin: '0 0 12px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>Period Summary</p>
            {[
              { label: 'Total Revenue',    value: '$' + totalRevenue.toFixed(2), color: '#fff'     },
              { label: 'Total BSC Profit', value: '$' + totalProfit.toFixed(2),  color: '#f5c518'  },
              { label: 'Total Orders',     value: String(totalOrders),           color: '#4ade80'  },
              { label: 'Avg Order Value',  value: '$' + avgOrder.toFixed(2),     color: '#60a5fa'  },
              { label: 'Profit Margin',    value: totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(1) + '%' : '0%', color: '#a78bfa' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #1e3a5f' }}>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{row.label}</p>
                <p style={{ margin: 0, color: row.color, fontWeight: 'bold', fontSize: 13 }}>{row.value}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* INVOICES TAB */}
      {tab === 'invoices' && (
        <>
          <input placeholder="🔍 Search by customer or invoice ID..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ display: 'block', width: '100%', padding: '11px 13px', borderRadius: 10, backgroundColor: '#111c33', color: '#fff', border: '1px solid #1e2d4a', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' as const, outline: 'none' }} />
          {searchFiltered.length === 0 && <div style={{ ...card, textAlign: 'center', padding: 30 }}><p style={{ color: '#4a5568', margin: 0 }}>No invoices found</p></div>}
          {searchFiltered.map(inv => {
            const type = getInvoiceType(inv);
            const typeInfo = getTypeLabel(type);
            const profit = inv.total * getMargin(type);
            const parts = inv.customerName.split(' | ');
            return (
              <div key={inv.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{typeInfo.icon}</span>
                      <span style={{ backgroundColor: '#060d1f', color: typeInfo.color, border: '1px solid ' + typeInfo.color, borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 'bold' }}>{typeInfo.label}</span>
                    </div>
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{parts[0]}</p>
                    {parts[1] && <p style={{ margin: '2px 0 0', color: '#f5c518', fontSize: 10 }}>{parts[1]}</p>}
                    <p style={{ margin: '2px 0 0', color: '#60a5fa', fontSize: 12 }}>📱 {inv.customerPhone}</p>
                    <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>{inv.date}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 16 }}>${inv.total.toFixed(2)}</p>
                    <p style={{ margin: '2px 0 0', color: typeInfo.color, fontSize: 12, fontWeight: 'bold' }}>+${profit.toFixed(2)}</p>
                    <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 10 }}>{inv.items.length} item{inv.items.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                {inv.items.map((item, i) => (
                  <div key={i} style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '7px 12px', marginBottom: 5, border: '1px solid #1e3a5f', display: 'flex', justifyContent: 'space-between' }}>
                    <p style={{ margin: 0, fontSize: 13 }}>{item.productName} <span style={{ color: '#4a5568' }}>× {item.qty}</span></p>
                    <p style={{ margin: 0, color: '#4ade80', fontSize: 13 }}>${item.total.toFixed(2)}</p>
                  </div>
                ))}
                <Link href={`/invoice?id=${encodeURIComponent(inv.id)}`} style={{ display: 'block', marginTop: 10, padding: '8px', borderRadius: 8, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', fontSize: 13, textAlign: 'center', textDecoration: 'none' }}>
                  🖨️ View / Print Invoice
                </Link>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
