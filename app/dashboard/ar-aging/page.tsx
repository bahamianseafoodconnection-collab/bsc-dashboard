'use client';

// /dashboard/ar-aging — Accounts Receivable aging report for wholesale
// credit accounts. Pulls every order with payment_method='account' and
// payment_status='unpaid', buckets them into 0-30 / 31-60 / 61-90 / 90+
// days, groups by customer, and lets admin click into a customer to
// see their unpaid invoices and mark them paid.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver']);

type Bucket = '0-30' | '31-60' | '61-90' | '90+';
const BUCKETS: Bucket[] = ['0-30','31-60','61-90','90+'];

interface UnpaidOrder {
  id:              string;
  created_at:      string;
  total:           number;
  customer_id:     string | null;
  customer_name:   string | null;
  customer_phone:  string | null;
  channel:         string | null;
  location:        string | null;
  age_days:        number;
  bucket:          Bucket;
}

interface CustomerAging {
  customer_id:     string | null;   // null = walk-in / unbound
  customer_name:   string;
  customer_phone:  string | null;
  oldest_age:      number;
  '0-30':          number;
  '31-60':         number;
  '61-90':         number;
  '90+':           number;
  total:           number;
  order_count:     number;
}

export default function ArAgingPage() {
  const [authed, setAuthed]   = useState<boolean | null>(null);
  const [orders, setOrders]   = useState<UnpaidOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [onlyStale, setOnlyStale] = useState(false);
  const [drill, setDrill]     = useState<CustomerAging | null>(null);
  const [markBusy, setMarkBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/ar-aging'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await load();
    })();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('ar_unpaid_orders')
      .select('id, created_at, total, customer_id, customer_name, customer_phone, channel, location, age_days, bucket')
      .order('created_at', { ascending: true });
    setOrders((data ?? []) as UnpaidOrder[]);
    setLoading(false);
  }

  const aging: CustomerAging[] = useMemo(() => {
    const map = new Map<string, CustomerAging>();
    for (const o of orders) {
      const key = o.customer_id ?? `phone:${o.customer_phone ?? 'unknown'}::${o.customer_name ?? 'unknown'}`;
      const existing = map.get(key);
      const row: CustomerAging = existing ?? {
        customer_id:    o.customer_id,
        customer_name:  o.customer_name ?? '(walk-in)',
        customer_phone: o.customer_phone,
        oldest_age:     0,
        '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0,
        total: 0, order_count: 0,
      };
      row[o.bucket] += Number(o.total);
      row.total     += Number(o.total);
      row.order_count += 1;
      if (o.age_days > row.oldest_age) row.oldest_age = o.age_days;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [orders]);

  const filtered = useMemo(() => {
    let rows = aging;
    if (onlyStale) rows = rows.filter(r => r.oldest_age > 90);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.customer_name.toLowerCase().includes(q) ||
        (r.customer_phone ?? '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [aging, search, onlyStale]);

  const totals = useMemo(() => {
    return aging.reduce((acc, r) => {
      acc['0-30']  += r['0-30'];
      acc['31-60'] += r['31-60'];
      acc['61-90'] += r['61-90'];
      acc['90+']   += r['90+'];
      acc.total    += r.total;
      acc.count    += r.order_count;
      return acc;
    }, { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0, count: 0 });
  }, [aging]);

  async function markPaid(orderId: string, method: string, notes?: string) {
    setMarkBusy(orderId);
    const { error } = await supabase.rpc('mark_account_order_paid', {
      p_order_id: orderId,
      p_method:   method,
      p_notes:    notes ?? null,
    });
    setMarkBusy(null);
    if (error) { alert('Mark paid failed: ' + error.message); return; }
    await load();
  }

  function customerOrders(c: CustomerAging): UnpaidOrder[] {
    return orders
      .filter(o => (c.customer_id ? o.customer_id === c.customer_id : o.customer_id === null && o.customer_name === c.customer_name && o.customer_phone === c.customer_phone))
      .sort((a, b) => a.age_days - b.age_days);
  }

  function downloadCsv() {
    const headers = ['Customer','Phone','Orders','0-30','31-60','61-90','90+','Total','Oldest age (days)'];
    const lines   = aging.map(r => [
      r.customer_name, r.customer_phone ?? '', r.order_count,
      r['0-30'].toFixed(2), r['31-60'].toFixed(2), r['61-90'].toFixed(2), r['90+'].toFixed(2),
      r.total.toFixed(2), r.oldest_age,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv  = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `bsc-ar-aging-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>🧾 AR aging — wholesale credit accounts</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {totals.count} unpaid invoice{totals.count === 1 ? '' : 's'} · {aging.length} customer{aging.length === 1 ? '' : 's'} · ${totals.total.toFixed(2)} outstanding
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>

        <div style={statGrid}>
          <Stat label="0-30 days"   value={`$${totals['0-30'].toFixed(2)}`}  accent="#4ade80" />
          <Stat label="31-60 days"  value={`$${totals['31-60'].toFixed(2)}`} accent="#fbbf24" />
          <Stat label="61-90 days"  value={`$${totals['61-90'].toFixed(2)}`} accent="#fb923c" />
          <Stat label="90+ days"    value={`$${totals['90+'].toFixed(2)}`}   accent="#f87171" />
          <Stat label="Total AR"    value={`$${totals.total.toFixed(2)}`}    accent="#f5c518" />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or phone…"
            style={{ flex: '1 1 240px', padding: '10px 12px', borderRadius: 10, background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            <input type="checkbox" checked={onlyStale} onChange={(e) => setOnlyStale(e.target.checked)} />
            Only 90+ days
          </label>
          <button onClick={downloadCsv} disabled={aging.length === 0}
            style={{ background: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid #f5c518', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            ⬇ CSV
          </button>
        </div>

        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && filtered.length === 0 && (
          <div style={empty}>
            {aging.length === 0
              ? '✓ No outstanding wholesale credit. All accounts paid up.'
              : 'No customers match your filter.'}
          </div>
        )}

        {filtered.length > 0 && (
          <div style={{ overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(245,197,24,0.15)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#0b1628' }}>
                <tr>
                  <th style={th}>Customer</th>
                  <th style={{ ...th, textAlign: 'right' }}>Orders</th>
                  <th style={{ ...th, textAlign: 'right' }}>0-30</th>
                  <th style={{ ...th, textAlign: 'right' }}>31-60</th>
                  <th style={{ ...th, textAlign: 'right' }}>61-90</th>
                  <th style={{ ...th, textAlign: 'right' }}>90+</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total</th>
                  <th style={{ ...th, textAlign: 'right' }}>Oldest</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={(c.customer_id ?? c.customer_name) + i}
                    onClick={() => setDrill(c)}
                    style={{ cursor: 'pointer', background: i % 2 === 0 ? '#060d1f' : '#0a1628' }}>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <div style={{ fontWeight: 700, color: '#fff' }}>{c.customer_name}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>{c.customer_phone ?? '—'}</div>
                    </td>
                    <td style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>{c.order_count}</td>
                    <td style={{ ...td, color: c['0-30']  > 0 ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>${c['0-30'].toFixed(2)}</td>
                    <td style={{ ...td, color: c['31-60'] > 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)' }}>${c['31-60'].toFixed(2)}</td>
                    <td style={{ ...td, color: c['61-90'] > 0 ? '#fb923c' : 'rgba(255,255,255,0.3)' }}>${c['61-90'].toFixed(2)}</td>
                    <td style={{ ...td, color: c['90+']   > 0 ? '#f87171' : 'rgba(255,255,255,0.3)', fontWeight: c['90+'] > 0 ? 700 : 400 }}>${c['90+'].toFixed(2)}</td>
                    <td style={{ ...td, color: '#f5c518', fontWeight: 800 }}>${c.total.toFixed(2)}</td>
                    <td style={{ ...td, color: c.oldest_age > 90 ? '#f87171' : c.oldest_age > 60 ? '#fb923c' : c.oldest_age > 30 ? '#fbbf24' : '#94a3b8', fontSize: 11 }}>
                      {c.oldest_age}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {drill && (
        <CustomerDrill
          customer={drill}
          orders={customerOrders(drill)}
          markPaid={markPaid}
          markBusy={markBusy}
          onClose={() => setDrill(null)}
          onLinked={async () => { await load(); setDrill(null); }}
        />
      )}
    </div>
  );
}

function CustomerDrill({ customer, orders, markPaid, markBusy, onClose, onLinked }: {
  customer: CustomerAging;
  orders:   UnpaidOrder[];
  markPaid: (orderId: string, method: string, notes?: string) => Promise<void>;
  markBusy: string | null;
  onClose:  () => void;
  onLinked: () => Promise<void>;
}) {
  const [methodPicker, setMethodPicker] = useState<string | null>(null);
  const [method, setMethod] = useState<'cash' | 'card' | 'wire' | 'check' | 'offset'>('wire');
  const [notes,  setNotes]  = useState('');
  const isOrphan = !customer.customer_id;

  // Link-to-customer state (only meaningful when isOrphan)
  const [linkOpen,  setLinkOpen]  = useState(false);
  const [linkPhone, setLinkPhone] = useState('');
  const [linkMatch, setLinkMatch] = useState<{ id: string; full_name: string; email: string | null; phone_e164: string } | null>(null);
  const [linkLooking, setLinkLooking] = useState(false);
  const [linkErr,   setLinkErr]   = useState<string | null>(null);
  const [linkBusy,  setLinkBusy]  = useState(false);
  const linkTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLinkMatch(null); setLinkErr(null);
    if (linkTimer.current) clearTimeout(linkTimer.current);
    if (linkPhone.trim().length < 7) return;
    setLinkLooking(true);
    linkTimer.current = setTimeout(async () => {
      const { data } = await supabase.rpc('bsc_lookup_customer_by_phone', { p_raw_phone: linkPhone.trim() });
      const match = Array.isArray(data) && data.length > 0 ? data[0] : null;
      setLinkMatch(match ?? null);
      setLinkErr(match ? null : 'No customer found with that phone — create one at /customers first, then come back.');
      setLinkLooking(false);
    }, 350);
  }, [linkPhone]);

  async function linkAllOrphansToMatch() {
    if (!linkMatch || !isOrphan) return;
    setLinkBusy(true);
    const ids = orders.map(o => o.id);
    const { error } = await supabase
      .from('orders')
      .update({ customer_id: linkMatch.id })
      .in('id', ids);
    setLinkBusy(false);
    if (error) { setLinkErr('Link failed: ' + error.message); return; }
    await onLinked();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#0b1628', borderRadius: 14, padding: 16, maxWidth: 780, width: '100%', marginTop: 32, border: '1px solid rgba(245,197,24,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", color: '#f5c518', margin: 0, fontSize: 20 }}>{customer.customer_name}</h3>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              {customer.customer_phone ?? '—'} · {customer.order_count} unpaid · ${customer.total.toFixed(2)} total · oldest {customer.oldest_age} days
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isOrphan && (
              <button onClick={() => setLinkOpen(v => !v)}
                style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid #60a5fa', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                🔗 Link to customer
              </button>
            )}
            {customer.customer_id && (
              <Link href={`/dashboard/ar-aging/statement/${customer.customer_id}`} target="_blank" rel="noopener noreferrer"
                style={{ background: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid #f5c518', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
                📄 Statement
              </Link>
            )}
            <button onClick={onClose} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
          </div>
        </div>

        {isOrphan && linkOpen && (
          <div style={{ background: '#0a1628', border: '1px solid #60a5fa', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              🔗 Link {orders.length} unpaid invoice{orders.length === 1 ? '' : 's'} to an existing customer
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>
              These invoices were rung up without a customer attached. Type the customer's phone to find their record — the system normalizes 7-digit ↦ +1242 automatically.
            </p>
            <input type="tel" inputMode="tel" placeholder="e.g. 242-555-0100"
              value={linkPhone} onChange={(e) => setLinkPhone(e.target.value)} autoFocus
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#060d1f', color: '#fff', border: '1px solid rgba(96,165,250,0.4)', fontSize: 14, marginBottom: 6, boxSizing: 'border-box' }} />
            {linkLooking && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Looking up…</p>}
            {linkMatch && (
              <div style={{ background: '#052e16', padding: '8px 10px', borderRadius: 6, marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 800 }}>✓ Found</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{linkMatch.full_name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{linkMatch.phone_e164}{linkMatch.email ? ` · ${linkMatch.email}` : ''}</div>
              </div>
            )}
            {linkErr && !linkMatch && <p style={{ fontSize: 11, color: '#f87171', marginBottom: 6 }}>{linkErr}</p>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setLinkOpen(false); setLinkPhone(''); setLinkMatch(null); setLinkErr(null); }}
                style={{ flex: 1, padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={linkAllOrphansToMatch} disabled={!linkMatch || linkBusy}
                style={{ flex: 2, padding: '8px 10px', borderRadius: 6, background: linkMatch ? '#60a5fa' : 'rgba(96,165,250,0.3)', color: '#fff', border: 'none', fontSize: 11, fontWeight: 800, cursor: linkMatch ? 'pointer' : 'not-allowed' }}>
                {linkBusy ? 'Linking…' : `🔗 Link ${orders.length} invoice${orders.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}

        <div style={statGrid}>
          <Stat label="0-30"  value={`$${customer['0-30'].toFixed(2)}`}  accent="#4ade80" small />
          <Stat label="31-60" value={`$${customer['31-60'].toFixed(2)}`} accent="#fbbf24" small />
          <Stat label="61-90" value={`$${customer['61-90'].toFixed(2)}`} accent="#fb923c" small />
          <Stat label="90+"   value={`$${customer['90+'].toFixed(2)}`}   accent="#f87171" small />
        </div>

        <h4 style={{ fontSize: 11, fontWeight: 800, color: '#f5c518', marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
          Unpaid invoices
        </h4>
        {orders.map((o) => {
          const ageColor = o.age_days > 90 ? '#f87171' : o.age_days > 60 ? '#fb923c' : o.age_days > 30 ? '#fbbf24' : '#4ade80';
          const isOpen   = methodPicker === o.id;
          return (
            <div key={o.id} style={{ background: '#060d1f', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 10, marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    <Link href={`/receipt/${o.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#f5c518', textDecoration: 'none' }}>
                      Invoice {o.id.slice(0, 8)} →
                    </Link>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                    {new Date(o.created_at).toLocaleDateString()} · {o.channel ?? '—'} · {o.location ?? '—'}
                    <span style={{ marginLeft: 8, color: ageColor, fontWeight: 700 }}>{o.age_days}d old</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#f5c518' }}>${Number(o.total).toFixed(2)}</div>
                  <button onClick={() => { setMethodPicker(isOpen ? null : o.id); setMethod('wire'); setNotes(''); }}
                    style={{ marginTop: 4, padding: '4px 10px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                    ✓ Mark paid
                  </button>
                </div>
              </div>

              {isOpen && (
                <div style={{ marginTop: 8, padding: 8, background: '#0a1628', borderRadius: 8, border: '1px solid rgba(34,197,94,0.4)' }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                    {(['cash','card','wire','check','offset'] as const).map(m => (
                      <button key={m} onClick={() => setMethod(m)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer',
                          background: method === m ? '#f5c518' : '#1a2e5a',
                          color:      method === m ? '#060d1f' : '#94a3b8',
                          border:     method === m ? '1px solid #f5c518' : '1px solid rgba(255,255,255,0.1)',
                        }}>
                        {m === 'cash' ? '💵 Cash' : m === 'card' ? '💳 Card' : m === 'wire' ? '🏦 Wire' : m === 'check' ? '✉️ Check' : '↔️ Offset'}
                      </button>
                    ))}
                  </div>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="payment ref / notes (optional)"
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 12, marginBottom: 6, boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setMethodPicker(null)} style={{ flex: 1, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button onClick={async () => { await markPaid(o.id, method, notes || undefined); setMethodPicker(null); }}
                      disabled={markBusy === o.id}
                      style={{ flex: 2, padding: '6px 10px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                      {markBusy === o.id ? 'Saving…' : `✓ Record ${method} payment`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, accent, small }: { label: string; value: string; accent: string; small?: boolean }) {
  return (
    <div style={{ background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 8, padding: small ? '6px 8px' : '10px 12px' }}>
      <div style={{ fontSize: small ? 8 : 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: small ? 13 : 17, fontWeight: 900, color: accent }}>{value}</div>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const empty: React.CSSProperties = { padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 };
const statGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(245,197,24,0.15)' };
const td: React.CSSProperties = { padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.04)', textAlign: 'right' };
