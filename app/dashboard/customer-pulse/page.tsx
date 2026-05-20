'use client';

// /dashboard/customer-pulse
//
// Dedrick's personal "who came back today" view. Per the founder-only-loop
// principle, this page is restricted to control_admin / founder / co_founder
// — NOT the wider admin set used by other dashboard pages. Other staff get
// access only when Dedrick explicitly grants it (a future tool can flip
// the role).
//
// Layout:
//   • Top stats: today's orders, profit, unique customers, returning vs new
//   • RETURNING customers section: each card shows name, phone, last visit
//     (days ago), what they bought today + the profit BSC made on it, and
//     a small "top items they usually buy" list (lifetime top 3).
//   • NEW customers section: first-time-today cards.
//   • LOT CONSUMPTION section: which spinytails_lots got drawn from today
//     and by whom — STUB for now. The schema link from order_items to
//     spinytails_lots isn't wired yet (no order_items.lot_code column).
//     Section explains the gap so the user knows what to wire next.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Narrower than the standard ADMIN_ROLES set — see project-founder-only-loop memory.
const FOUNDER_ROLES = new Set(['founder','co_founder','control_admin']);

interface OrderRow {
  id:              string;
  created_at:      string;
  customer_id:     string | null;
  customer_name:   string | null;
  customer_phone:  string | null;
  total:           number | null;
  net_profit:      number | null;
  order_type:      string | null;
  wholesale_items: unknown;
  admin_notes:     string | null;
}

interface CustomerRow {
  id:               string;
  full_name:        string | null;
  phone:            string | null;
  phone_e164:       string | null;
  total_orders:     number | null;
  total_spent:      number | null;
  first_seen_at:    string | null;
  last_seen_at:     string | null;
  origin_channel:   string | null;
}

interface PulseCustomer {
  customer_id:    string;
  full_name:      string;
  phone:          string;
  is_returning:   boolean;          // had prior orders before today
  lifetime_orders: number;
  lifetime_spent:  number;
  last_seen_at:    string | null;   // null = brand new
  today_orders:    OrderRow[];
  today_total:     number;
  today_profit:    number;
  top_items:       Array<{ name: string; count: number }>;  // lifetime top 3
}

function daysAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff} days ago`;
}

function dollars(n: number): string {
  return n < 0 ? `−$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

function isoStartOfDay(d: Date): string {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString();
}
function isoEndOfDay(d: Date): string {
  const x = new Date(d); x.setHours(23, 59, 59, 999); return x.toISOString();
}

interface OrderItem { name?: string; sku?: string; quantity?: number; qty?: number; }
function extractItems(wholesale_items: unknown): OrderItem[] {
  if (Array.isArray(wholesale_items)) return wholesale_items as OrderItem[];
  if (typeof wholesale_items === 'string') {
    try { const p = JSON.parse(wholesale_items); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

// Heuristic — pull anything that LOOKS like a lot code (STPC-YYYYMMDD-VV-NN or
// BSC-FISH-...) from an order's items / notes. Until order_items.lot_code is
// wired, this is the only signal we have for "what lot did this order draw from".
const LOT_REGEX = /\b(STPC-\d{8}-[A-Z]{2}-\d{2}|BSC-FISH-[A-Z0-9-]+)\b/g;
function extractLotCodes(o: OrderRow): string[] {
  const blob = JSON.stringify(o.wholesale_items ?? '') + ' ' + (o.admin_notes ?? '');
  const m = blob.match(LOT_REGEX);
  return m ? Array.from(new Set(m)) : [];
}

export default function CustomerPulsePage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [day,    setDay]    = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [loading,  setLoading]  = useState(false);
  const [orders,   setOrders]   = useState<OrderRow[]>([]);
  const [pulse,    setPulse]    = useState<PulseCustomer[]>([]);
  const [err,      setErr]      = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/customer-pulse'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !FOUNDER_ROLES.has(prof.role as string)) {
        window.location.href = '/dashboard';
        return;
      }
      setAuthed(true);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const fromIso = isoStartOfDay(day);
    const toIso   = isoEndOfDay(day);

    // 1. Today's orders
    const { data: ordsData, error: ordsErr } = await supabase
      .from('orders')
      .select('id, created_at, customer_id, customer_name, customer_phone, total, net_profit, order_type, wholesale_items, admin_notes')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false });
    if (ordsErr) { setErr(ordsErr.message); setLoading(false); return; }
    const ords = (ordsData ?? []) as OrderRow[];
    setOrders(ords);

    if (ords.length === 0) { setPulse([]); setLoading(false); return; }

    // 2. Unique customer_ids (skip Walk-In Anonymous singleton + nulls)
    const WALK_IN_ID = '00000000-0000-0000-0000-000000000001';
    const customerIds = Array.from(new Set(ords.map(o => o.customer_id).filter((id): id is string => !!id && id !== WALK_IN_ID)));

    if (customerIds.length === 0) { setPulse([]); setLoading(false); return; }

    // 3. Pull customer records
    const { data: custsData } = await supabase
      .from('customers')
      .select('id, full_name, phone, phone_e164, total_orders, total_spent, first_seen_at, last_seen_at, origin_channel')
      .in('id', customerIds);
    const customerMap = new Map<string, CustomerRow>();
    for (const c of (custsData ?? []) as CustomerRow[]) customerMap.set(c.id, c);

    // 4. For each customer, pull their LIFETIME orders to derive top items.
    //    Cap to last 200 per customer for cost; the top items are stable.
    const lifetimeOrdersByCust = new Map<string, OrderRow[]>();
    const { data: lifetimeData } = await supabase
      .from('orders')
      .select('id, created_at, customer_id, customer_name, customer_phone, total, net_profit, order_type, wholesale_items, admin_notes')
      .in('customer_id', customerIds)
      .order('created_at', { ascending: false })
      .limit(2000);
    for (const o of (lifetimeData ?? []) as OrderRow[]) {
      if (!o.customer_id) continue;
      const arr = lifetimeOrdersByCust.get(o.customer_id) ?? [];
      arr.push(o);
      lifetimeOrdersByCust.set(o.customer_id, arr);
    }

    // 5. Build pulse rows
    const dayStartMs = new Date(fromIso).getTime();
    const out: PulseCustomer[] = customerIds.map(cid => {
      const c = customerMap.get(cid);
      const todays = ords.filter(o => o.customer_id === cid);
      const lifetime = lifetimeOrdersByCust.get(cid) ?? [];
      // Returning = at least one order strictly before day start
      const priorOrders = lifetime.filter(o => new Date(o.created_at).getTime() < dayStartMs);
      const isReturning = priorOrders.length > 0;

      // Top items by frequency from lifetime
      const itemCounts = new Map<string, number>();
      for (const o of lifetime) {
        for (const item of extractItems(o.wholesale_items)) {
          const k = (item.name ?? item.sku ?? '').trim();
          if (!k) continue;
          itemCounts.set(k, (itemCounts.get(k) ?? 0) + 1);
        }
      }
      const topItems = Array.from(itemCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }));

      return {
        customer_id: cid,
        full_name:   c?.full_name ?? todays[0]?.customer_name ?? '(unknown)',
        phone:       c?.phone_e164 ?? c?.phone ?? todays[0]?.customer_phone ?? '',
        is_returning: isReturning,
        lifetime_orders: c?.total_orders ?? lifetime.length,
        lifetime_spent:  Number(c?.total_spent ?? lifetime.reduce((s, o) => s + Number(o.total ?? 0), 0)),
        last_seen_at: isReturning
          ? (priorOrders[0]?.created_at ?? c?.last_seen_at ?? null)
          : null,
        today_orders: todays,
        today_total:  todays.reduce((s, o) => s + Number(o.total ?? 0), 0),
        today_profit: todays.reduce((s, o) => s + Number(o.net_profit ?? 0), 0),
        top_items: topItems,
      };
    });

    out.sort((a, b) => b.today_profit - a.today_profit);
    setPulse(out);
    setLoading(false);
  }, [day]);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  // Summary stats
  const stats = useMemo(() => {
    const returning = pulse.filter(p => p.is_returning).length;
    const newOnes   = pulse.filter(p => !p.is_returning).length;
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((s, o) => s + Number(o.total ?? 0), 0);
    const totalProfit  = orders.reduce((s, o) => s + Number(o.net_profit ?? 0), 0);
    return { returning, newOnes, totalOrders, totalRevenue, totalProfit, uniqueCustomers: pulse.length };
  }, [pulse, orders]);

  // Lot consumption summary (best-effort until order_items.lot_code is wired)
  const lotConsumption = useMemo(() => {
    const lotToCustomers = new Map<string, Set<string>>();
    for (const o of orders) {
      const lots = extractLotCodes(o);
      const who  = o.customer_name ?? '(unknown)';
      for (const lot of lots) {
        const set = lotToCustomers.get(lot) ?? new Set<string>();
        set.add(who);
        lotToCustomers.set(lot, set);
      }
    }
    return Array.from(lotToCustomers.entries()).map(([lot, custs]) => ({ lot, customers: Array.from(custs) }));
  }, [orders]);

  if (authed === null) return <div style={pg}>Loading…</div>;

  const dayLabel = day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/dashboard" style={back}>← Dashboard</Link>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => setDay(d => { const x = new Date(d); x.setDate(x.getDate() - 1); return x; })} style={navBtn}>← Prev</button>
              <input type="date" value={day.toISOString().slice(0, 10)}
                onChange={e => { const x = new Date(e.target.value); x.setHours(0,0,0,0); setDay(x); }}
                style={dateInput} />
              <button onClick={() => setDay(d => { const x = new Date(d); x.setDate(x.getDate() + 1); return x; })} style={navBtn}>Next →</button>
              <button onClick={() => { const x = new Date(); x.setHours(0,0,0,0); setDay(x); }} style={{ ...navBtn, color: '#f5c518', borderColor: '#f5c518' }}>Today</button>
            </div>
          </div>
          <h1 style={h1}>👥 Customer pulse — {dayLabel}</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Founder-only view of who came back, what they bought, and the profit BSC made on each sale. Only control_admin / founder / co_founder can open this page.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        {err && <div style={errBox}>⚠ {err}</div>}

        <div style={statGrid}>
          <Stat label="Orders today"        value={stats.totalOrders.toString()}             accent="#f5c518" />
          <Stat label="Unique customers"    value={stats.uniqueCustomers.toString()}         accent="#60a5fa" />
          <Stat label="Returning"           value={stats.returning.toString()}               accent="#4ade80" />
          <Stat label="New"                 value={stats.newOnes.toString()}                 accent="#fbbf24" />
          <Stat label="Revenue"             value={dollars(stats.totalRevenue)}              accent="#f5c518" />
          <Stat label="Net profit"          value={dollars(stats.totalProfit)}               accent={stats.totalProfit < 0 ? '#f87171' : '#4ade80'} />
        </div>

        {loading && <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16 }}>Loading…</p>}

        {!loading && pulse.length === 0 && (
          <div style={emptyBox}>
            <div style={{ fontSize: 32 }}>🪺</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f5c518', marginTop: 6 }}>No identified customers on {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
              Walk-In Anonymous sales aren't listed here — they show in the regular sales feed.
            </div>
          </div>
        )}

        {/* RETURNING */}
        {!loading && pulse.some(p => p.is_returning) && (
          <section style={{ marginTop: 18 }}>
            <h2 style={sectionH2}>🔁 Returning today ({pulse.filter(p => p.is_returning).length})</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {pulse.filter(p => p.is_returning).map(p => <CustomerCard key={p.customer_id} c={p} />)}
            </div>
          </section>
        )}

        {/* NEW */}
        {!loading && pulse.some(p => !p.is_returning) && (
          <section style={{ marginTop: 24 }}>
            <h2 style={sectionH2}>✨ New today ({pulse.filter(p => !p.is_returning).length})</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {pulse.filter(p => !p.is_returning).map(p => <CustomerCard key={p.customer_id} c={p} />)}
            </div>
          </section>
        )}

        {/* LOT CONSUMPTION */}
        <section style={{ marginTop: 28 }}>
          <h2 style={sectionH2}>📦 Lot consumption today ({lotConsumption.length})</h2>
          {lotConsumption.length === 0 ? (
            <div style={{ ...emptyBox, marginTop: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f5c518' }}>No STPC / BSC-FISH lot codes detected in today&apos;s orders.</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 6, lineHeight: 1.6, maxWidth: 540, margin: '6px auto 0' }}>
                Trace-loop limit: until <code style={{ background: '#0b1628', padding: '0 4px', borderRadius: 3 }}>order_items.lot_code</code> is added,
                this view scans order notes + cart items for STPC-YYYYMMDD-VV-NN patterns. The next migration that wires
                a real <code style={{ background: '#0b1628', padding: '0 4px', borderRadius: 3 }}>lot_code</code> column on order line items closes
                the loop fully — every STPC lot will list its customers and every customer will list the lots they consumed.
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {lotConsumption.map(({ lot, customers }) => (
                <div key={lot} style={lotCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <Link href={`/spinytails/lots/${encodeURIComponent(lot)}`}
                      style={{ fontFamily: 'monospace', fontSize: 13, color: '#f5c518', fontWeight: 800, textDecoration: 'none' }}>{lot} →</Link>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{customers.length} customer{customers.length === 1 ? '' : 's'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                    Sold to: {customers.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 28, lineHeight: 1.6 }}>
          Per the founder-only-loop principle, this page is restricted to <code style={{ background: '#0b1628', padding: '0 4px', borderRadius: 3 }}>control_admin</code> / <code style={{ background: '#0b1628', padding: '0 4px', borderRadius: 3 }}>founder</code> / <code style={{ background: '#0b1628', padding: '0 4px', borderRadius: 3 }}>co_founder</code>.
          Other staff get access only when Dedrick explicitly grants it (a future tool can flip the role).
        </p>
      </main>
    </div>
  );
}

function CustomerCard({ c }: { c: PulseCustomer }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#fff', fontSize: 15 }}>{c.full_name}</strong>
          {c.phone && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 8, fontFamily: 'monospace' }}>{c.phone}</span>}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
          {c.is_returning ? <>Last seen <strong style={{ color: '#fff' }}>{daysAgo(c.last_seen_at)}</strong></> : 'First time today'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6, marginTop: 8 }}>
        <Mini label="Today's orders" value={c.today_orders.length.toString()} />
        <Mini label="Today's revenue" value={dollars(c.today_total)} />
        <Mini label="Today's profit"  value={dollars(c.today_profit)} accent={c.today_profit < 0 ? '#f87171' : '#4ade80'} />
        {c.is_returning && (
          <>
            <Mini label="Lifetime orders" value={c.lifetime_orders.toString()} />
            <Mini label="Lifetime spent"  value={dollars(c.lifetime_spent)} />
          </>
        )}
      </div>

      {c.today_orders.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>What they came back for</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
            {c.today_orders.map(o => {
              const items = extractItems(o.wholesale_items);
              const summary = items.length > 0
                ? items.slice(0, 3).map(it => `${it.name ?? it.sku ?? '?'}${it.quantity ?? it.qty ? ` ×${it.quantity ?? it.qty}` : ''}`).join(', ')
                : `${o.order_type ?? 'order'} #${o.id.slice(0, 8)}`;
              return <div key={o.id}>• {summary} <span style={{ color: 'rgba(255,255,255,0.5)' }}>— {dollars(Number(o.total ?? 0))}</span></div>;
            })}
          </div>
        </div>
      )}

      {c.top_items.length > 0 && c.is_returning && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Usually buys</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {c.top_items.map(it => (
              <span key={it.name} style={{ background: 'rgba(245,197,24,0.1)', color: '#f5c518', border: '1px solid rgba(245,197,24,0.3)', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{it.name} <span style={{ opacity: 0.6 }}>·{it.count}</span></span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: accent }}>{value}</div>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: '#060d1f', border: '1px solid rgba(245,197,24,0.1)', borderRadius: 6, padding: '6px 8px' }}>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: accent ?? '#fff' }}>{value}</div>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const sectionH2: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 16, color: '#f5c518', margin: '0 0 8px', borderBottom: '1px solid rgba(245,197,24,0.15)', paddingBottom: 4 };
const card: React.CSSProperties = { background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 10, padding: 12 };
const lotCard: React.CSSProperties = { background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 8, padding: 10 };
const errBox: React.CSSProperties = { padding: 12, background: 'rgba(248,113,113,0.15)', border: '1px solid #f87171', color: '#f87171', borderRadius: 8, marginBottom: 12 };
const emptyBox: React.CSSProperties = { marginTop: 16, padding: 24, textAlign: 'center', background: 'rgba(245,197,24,0.05)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 };
const statGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 };
const dateInput: React.CSSProperties = { background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '4px 8px', fontSize: 12 };
const navBtn: React.CSSProperties = { background: 'transparent', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' };
