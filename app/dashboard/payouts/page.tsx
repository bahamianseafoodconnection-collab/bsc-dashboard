'use client';

// /dashboard/payouts — bi-weekly vendor payout calculator + RBC CSV export.
// Disabled in beta mode (BETA_MODE_VENDORS=true → commission=0 → vendors
// get 100%, so payouts == total_sales).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface OrderRow {
  id: string; vendor_id: string; total_price: number; commission_amount: number;
  vendor_payout: number; status: string; created_at: string;
  delivered_to_customer_at: string | null;
}
interface VendorMini { id: string; business_name: string; bank_account_name: string | null; bank_account_number: string | null; routing_info: string | null; }

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','manager','basic_admin']);

export default function PayoutsPage() {
  const [orders,   setOrders]   = useState<OrderRow[]>([]);
  const [vendors,  setVendors]  = useState<Record<string, VendorMini>>({});
  const [from,     setFrom]     = useState<string>(() => isoDaysAgo(14));
  const [to,       setTo]       = useState<string>(() => todayIso());
  const [loading,  setLoading]  = useState(true);
  const [authed,   setAuthed]   = useState<boolean | null>(null);
  const [beta,     setBeta]     = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/payouts'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      // Fetch beta flag from a tiny /api/env-flag if we had one; here read
      // by inferring from data — if every delivered order has commission=0
      // we're effectively in beta. The page also shows a static banner if
      // BETA_MODE_VENDORS=true is in env (a no-op flag check via fetch
      // could be added later; for now we just show the banner unconditionally).
      setBeta(true);
      await load();
      setLoading(false);
    })();
  }, []);

  async function load() {
    const { data } = await supabase.from('vendor_orders')
      .select('id, vendor_id, total_price, commission_amount, vendor_payout, status, created_at, delivered_to_customer_at')
      .eq('status', 'delivered_to_customer')
      .gte('delivered_to_customer_at', from + 'T00:00:00Z')
      .lte('delivered_to_customer_at', to   + 'T23:59:59Z')
      .order('delivered_to_customer_at', { ascending: false }).limit(500);
    const list = (data ?? []) as OrderRow[];
    setOrders(list);
    if (list.length === 0) return;
    const vids = Array.from(new Set(list.map((o) => o.vendor_id)));
    const { data: vs } = await supabase.from('vendors').select('id, business_name, bank_account_name, bank_account_number, routing_info').in('id', vids);
    const vm: Record<string, VendorMini> = {}; for (const v of (vs ?? []) as VendorMini[]) vm[v.id] = v;
    setVendors(vm);
  }

  const perVendor = useMemo(() => {
    const map = new Map<string, { vendor_id: string; orders: number; sales: number; commission: number; payout: number }>();
    for (const o of orders) {
      const ex = map.get(o.vendor_id) ?? { vendor_id: o.vendor_id, orders: 0, sales: 0, commission: 0, payout: 0 };
      ex.orders     += 1;
      ex.sales      += Number(o.total_price ?? 0);
      ex.commission += Number(o.commission_amount ?? 0);
      ex.payout     += Number(o.vendor_payout ?? 0);
      map.set(o.vendor_id, ex);
    }
    return Array.from(map.values()).sort((a, b) => b.payout - a.payout);
  }, [orders]);

  function exportCsv() {
    const rows: string[] = [];
    rows.push(['vendor_id','business_name','bank_account_name','bank_account_number','routing','orders','sales','commission','net_payout','period_start','period_end'].join(','));
    for (const p of perVendor) {
      const v = vendors[p.vendor_id];
      const cells = [
        p.vendor_id,
        csv(v?.business_name ?? ''),
        csv(v?.bank_account_name ?? ''),
        csv(v?.bank_account_number ?? ''),
        csv(v?.routing_info ?? ''),
        String(p.orders),
        p.sales.toFixed(2),
        p.commission.toFixed(2),
        p.payout.toFixed(2),
        from, to,
      ];
      rows.push(cells.join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bsc-payouts-${from}-to-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (authed === null) return <div style={pg}>Loading…</div>;
  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>💸 Vendor payouts</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>Bi-weekly default · CSV export for RBC batch transfer</p>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        {beta && (
          <div style={{ padding: 14, borderRadius: 12, marginBottom: 14, background: 'rgba(245,197,24,0.12)', border: '1px solid #f5c518', color: '#f5c518', fontSize: 13 }}>
            <strong>BETA MODE</strong> · commission is currently 0% · vendors receive 100% of sale price. Flip <code>BETA_MODE_VENDORS=false</code> in Vercel to start charging the 15% cut.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Period start"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} /></Field>
          <Field label="Period end"><input type="date" value={to}   onChange={(e) => setTo(e.target.value)}   style={inp} /></Field>
          <button onClick={load} style={btn}>Refresh</button>
          <button onClick={exportCsv} disabled={perVendor.length === 0} style={{ ...btn, background: '#f5c518', color: '#060d1f', fontWeight: 800 }}>⬇ Export CSV</button>
        </div>

        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && perVendor.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 }}>No delivered orders in this window.</div>}

        {perVendor.map((p) => {
          const v = vendors[p.vendor_id];
          return (
            <article key={p.vendor_id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{v?.business_name ?? p.vendor_id.slice(0, 8)}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{p.orders} delivered order{p.orders === 1 ? '' : 's'}{v?.bank_account_number ? ` · acct ${v.bank_account_number}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#f5c518', fontSize: 18 }}>${p.payout.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>sales ${p.sales.toFixed(2)} · commission ${p.commission.toFixed(2)}</div>
                </div>
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}

function csv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function todayIso() { return new Date().toISOString().slice(0,10); }
function isoDaysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10); }

const pg: React.CSSProperties   = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif" };
const hdr: React.CSSProperties  = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties   = { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const card: React.CSSProperties = { background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 8 };
const inp: React.CSSProperties  = { padding: '8px 10px', borderRadius: 8, background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 13 };
const btn: React.CSSProperties  = { padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', fontSize: 12, cursor: 'pointer' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div>
    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>{label}</div>
    {children}
  </div>;
}
