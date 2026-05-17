'use client';

// Demand prep — "Who's buying on Saturday and what do they want?"
//
// Pulls the last 90 days of orders that had a named customer, groups by
// day-of-week, and for the target day shows every repeat customer (2+
// visits on that DOW) with their usual basket, average spend, and last
// visit. Staff can mark "Prepped ✓" so floor work doesn't double up.
//
// Day-priority ranking is hard-coded per founder: Sat/Sun > Wed/Fri >
// Tue/Thu. Monday is the quiet day, still listed for completeness.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const DAYS = [
  { dow: 6, name: 'Saturday',  tier: 'PEAK',   color: '#16a34a' },
  { dow: 0, name: 'Sunday',    tier: 'PEAK',   color: '#16a34a' },
  { dow: 3, name: 'Wednesday', tier: 'BUSY',   color: '#f5c518' },
  { dow: 5, name: 'Friday',    tier: 'BUSY',   color: '#f5c518' },
  { dow: 2, name: 'Tuesday',   tier: 'STEADY', color: '#94a3b8' },
  { dow: 4, name: 'Thursday',  tier: 'STEADY', color: '#94a3b8' },
  { dow: 1, name: 'Monday',    tier: 'QUIET',  color: '#64748b' },
];

interface RawItem {
  sku?: string;
  name?: string;
  quantity?: number;
  weight_lb?: number | null;
  line_total?: number;
}
interface RawOrder {
  id: string;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total: number | null;
  wholesale_items: unknown;
}
interface ItemAgg {
  sku?:        string;
  name:        string;
  times:       number;
  total_qty:   number;
}
interface CustomerPrep {
  customer_id: string;
  name:        string;
  phone:       string | null;
  visits:      number;
  last_visit:  string;
  total_spend: number;
  avg_spend:   number;
  top_items:   ItemAgg[];
}

const STORAGE_KEY = 'bsc.prep.checked.';

export default function PrepPage() {
  // Default to TODAY's DOW (so opening on Saturday morning shows today).
  const todayDow = new Date().getDay();
  const [targetDow, setTargetDow] = useState<number>(todayDow);
  const [orders,    setOrders]    = useState<RawOrder[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState<string | null>(null);
  const [checked,   setChecked]   = useState<Set<string>>(new Set());

  // Load 90 days of named-customer orders ONCE; filter in JS by DOW.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const { data, error } = await supabase
        .from('orders')
        .select('id, created_at, customer_id, customer_name, customer_phone, total, wholesale_items')
        .gte('created_at', since.toISOString())
        .not('customer_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (cancelled) return;
      if (error) setErr(error.message); else setOrders((data ?? []) as RawOrder[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Restore today's "Prepped ✓" set from localStorage per-day.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `${STORAGE_KEY}${dateKey()}${targetDow}`;
    try {
      const raw = localStorage.getItem(key);
      setChecked(raw ? new Set(JSON.parse(raw) as string[]) : new Set());
    } catch { setChecked(new Set()); }
  }, [targetDow]);

  function dateKey(): string {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.`;
  }

  function toggleChecked(customerId: string) {
    const next = new Set(checked);
    if (next.has(customerId)) next.delete(customerId); else next.add(customerId);
    setChecked(next);
    if (typeof window !== 'undefined') {
      const key = `${STORAGE_KEY}${dateKey()}${targetDow}`;
      try { localStorage.setItem(key, JSON.stringify(Array.from(next))); } catch { /* */ }
    }
  }

  // Aggregate to per-customer prep cards for the selected DOW.
  const prepList = useMemo<CustomerPrep[]>(() => {
    const dayOrders = orders.filter(o => new Date(o.created_at).getDay() === targetDow);
    const byCustomer = new Map<string, { c: CustomerPrep; itemMap: Map<string, ItemAgg> }>();
    for (const o of dayOrders) {
      if (!o.customer_id) continue;
      let bucket = byCustomer.get(o.customer_id);
      if (!bucket) {
        bucket = {
          c: {
            customer_id: o.customer_id,
            name:        o.customer_name ?? '(unnamed)',
            phone:       o.customer_phone,
            visits:      0,
            last_visit:  '',
            total_spend: 0,
            avg_spend:   0,
            top_items:   [],
          },
          itemMap: new Map(),
        };
        byCustomer.set(o.customer_id, bucket);
      }
      bucket.c.visits      += 1;
      bucket.c.total_spend += Number(o.total ?? 0);
      if (!bucket.c.last_visit || o.created_at > bucket.c.last_visit) bucket.c.last_visit = o.created_at;
      const items: RawItem[] = Array.isArray(o.wholesale_items) ? (o.wholesale_items as RawItem[]) : [];
      for (const it of items) {
        const key = it.sku ?? it.name ?? 'unknown';
        const ex  = bucket.itemMap.get(key) ?? { sku: it.sku, name: it.name ?? 'Unknown item', times: 0, total_qty: 0 };
        ex.times    += 1;
        ex.total_qty += Number(it.weight_lb ?? it.quantity ?? 0);
        bucket.itemMap.set(key, ex);
      }
    }
    const result = Array.from(byCustomer.values())
      .filter(({ c }) => c.visits >= 2) // 2+ visits on this DOW = regular
      .map(({ c, itemMap }) => ({
        ...c,
        avg_spend: c.total_spend / Math.max(c.visits, 1),
        top_items: Array.from(itemMap.values()).sort((a, b) => b.times - a.times).slice(0, 5),
      }))
      .sort((a, b) => b.avg_spend - a.avg_spend);
    return result;
  }, [orders, targetDow]);

  const tierForToday = DAYS.find(d => d.dow === targetDow);
  const totalExpected = prepList.length;
  const totalPredictedRevenue = prepList.reduce((s, c) => s + c.avg_spend, 0);

  // ── RENDER ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif" }}>
      <header style={{ borderBottom: '1px solid rgba(245,197,24,0.2)', padding: '14px 18px', background: '#0b1628' }}>
        <Link href="/dashboard" style={{ color: '#f5c518', fontSize: 12, textDecoration: 'none' }}>← Dashboard</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f5c518', fontFamily: "'Playfair Display', serif", margin: '4px 0 2px' }}>
          🛒 Prep List
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
          Regulars expected for the day · who they are · what they always buy
        </p>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>

        {/* Day selector */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginBottom: 14 }}>
          {DAYS.sort((a, b) => a.dow - b.dow).map((d) => {
            const sel = d.dow === targetDow;
            return (
              <button key={d.dow} onClick={() => setTargetDow(d.dow)}
                style={{
                  padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                  background: sel ? '#1a2e5a' : 'rgba(255,255,255,0.04)',
                  border: sel ? `2px solid ${d.color}` : '2px solid rgba(255,255,255,0.08)',
                  color: sel ? d.color : 'rgba(255,255,255,0.7)',
                  fontSize: 11, fontWeight: 700, textAlign: 'center',
                }}>
                <div style={{ fontSize: 9, opacity: 0.7, letterSpacing: 0.4 }}>{d.tier}</div>
                <div>{d.name.slice(0, 3).toUpperCase()}</div>
              </button>
            );
          })}
        </div>

        {/* Summary banner */}
        <div style={{
          padding: 14, borderRadius: 12, marginBottom: 14,
          background: 'rgba(255,255,255,0.04)', border: `1px solid ${tierForToday?.color ?? '#444'}30`,
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
        }}>
          <Stat label={`${tierForToday?.name ?? 'Day'} tier`} value={tierForToday?.tier ?? '—'} color={tierForToday?.color} />
          <Stat label="Regulars expected" value={String(totalExpected)} color="#f5c518" />
          <Stat label="Predicted total" value={`$${totalPredictedRevenue.toFixed(0)}`} color="#4ade80" />
        </div>

        {err     && <p style={{ color: '#f87171', fontSize: 13 }}>⚠ {err}</p>}
        {loading && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', padding: 30 }}>Loading 90 days of orders…</p>}

        {!loading && prepList.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 12 }}>
            No repeat customers for {tierForToday?.name ?? 'this day'} in the last 90 days.
          </div>
        )}

        {prepList.map((c) => {
          const isDone = checked.has(c.customer_id);
          return (
            <div key={c.customer_id} style={{
              padding: 14, borderRadius: 12, marginBottom: 10,
              background: isDone ? 'rgba(22,163,74,0.08)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isDone ? 'rgba(22,163,74,0.3)' : 'rgba(255,255,255,0.08)'}`,
              opacity: isDone ? 0.7 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 15, textDecoration: isDone ? 'line-through' : 'none' }}>{c.name}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                    {c.visits} visit{c.visits === 1 ? '' : 's'} on {tierForToday?.name ?? 'this day'} · last {daysAgo(c.last_visit)} days ago · usually ~${c.avg_spend.toFixed(2)}
                  </p>
                </div>
                <button onClick={() => toggleChecked(c.customer_id)}
                  style={{
                    flexShrink: 0, padding: '6px 12px', borderRadius: 16, fontSize: 11, fontWeight: 700,
                    border: '1px solid', cursor: 'pointer',
                    color: isDone ? '#4ade80' : '#f5c518',
                    borderColor: isDone ? '#16a34a' : 'rgba(245,197,24,0.4)',
                    background: isDone ? 'rgba(22,163,74,0.15)' : 'transparent',
                  }}>
                  {isDone ? '✓ Prepped' : 'Mark prepped'}
                </button>
              </div>

              {c.top_items.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#0b1628' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    Usual basket
                  </p>
                  {c.top_items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: i < c.top_items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <span style={{ color: 'rgba(255,255,255,0.85)' }}>{it.name}</span>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginLeft: 8 }}>
                        {it.times}× ·{it.total_qty > 0 ? ` ${it.total_qty.toFixed(it.total_qty < 5 ? 1 : 0)} total` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {c.phone && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <a href={`tel:${c.phone}`} style={miniBtn('#60a5fa')}>📞 Call</a>
                  <a href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={miniBtn('#25d366')}>💬 WhatsApp</a>
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}

function daysAgo(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function miniBtn(c: string): React.CSSProperties {
  return {
    flex: 1, textAlign: 'center', padding: '6px 8px', borderRadius: 8,
    fontSize: 11, fontWeight: 700, color: c,
    background: `${c}15`, border: `1px solid ${c}40`, textDecoration: 'none',
  };
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? '#fff', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{label}</div>
    </div>
  );
}
