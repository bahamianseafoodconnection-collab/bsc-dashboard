'use client';

// /dashboard/quality-control — Spiny Tail inspection queue.
// Visible to processor / receiver / control_admin / founder / co_founder / manager.
// Inspector can pass/reject; reject bumps vendor.quality_rejections_count.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface OrderRow {
  id: string; listing_id: string; vendor_id: string; customer_id: string | null;
  quantity: number; total_price: number; status: string;
  dropoff_at: string | null; qc_notes: string | null; created_at: string;
}
interface ListingMini { id: string; title: string; unit: string; }
interface VendorMini  { id: string; business_name: string; phone: string | null; quality_rejections_count: number; }

const QC_ROLES = new Set(['founder','co_founder','control_admin','manager','processor','receiver']);

export default function QualityControlPage() {
  const [orders,   setOrders]   = useState<OrderRow[]>([]);
  const [listings, setListings] = useState<Record<string, ListingMini>>({});
  const [vendors,  setVendors]  = useState<Record<string, VendorMini>>({});
  const [notes,    setNotes]    = useState<Record<string, string>>({});
  const [authed,   setAuthed]   = useState<boolean | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/quality-control'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !QC_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await load();
      setLoading(false);
    })();
  }, []);

  async function load() {
    const { data } = await supabase.from('vendor_orders')
      .select('*').in('status', ['dropped_off','qc_pending']).order('dropoff_at', { ascending: true, nullsFirst: false }).limit(120);
    const list = (data ?? []) as OrderRow[];
    setOrders(list);
    if (list.length === 0) return;
    const lids = Array.from(new Set(list.map((o) => o.listing_id)));
    const vids = Array.from(new Set(list.map((o) => o.vendor_id)));
    const [{ data: ls }, { data: vs }] = await Promise.all([
      supabase.from('vendor_listings').select('id, title, unit').in('id', lids),
      supabase.from('vendors').select('id, business_name, phone, quality_rejections_count').in('id', vids),
    ]);
    const lm: Record<string, ListingMini> = {}; for (const l of (ls ?? []) as ListingMini[]) lm[l.id] = l;
    const vm: Record<string, VendorMini>  = {}; for (const v of (vs ?? []) as VendorMini[])  vm[v.id] = v;
    setListings(lm); setVendors(vm);
  }

  async function decide(o: OrderRow, pass: boolean) {
    const { data: { session } } = await supabase.auth.getSession();
    const note = notes[o.id]?.trim() || null;
    const now  = new Date().toISOString();
    await supabase.from('vendor_orders').update({
      status:          pass ? 'qc_passed' : 'qc_rejected',
      qc_inspected_at: now,
      qc_inspector_id: session?.user.id ?? null,
      qc_notes:        note,
    }).eq('id', o.id);
    if (!pass) {
      const v = vendors[o.vendor_id];
      if (v) await supabase.from('vendors').update({ quality_rejections_count: (v.quality_rejections_count ?? 0) + 1 }).eq('id', v.id);
    }
    await load();
  }

  if (authed === null) return <div style={pg}>Loading…</div>;
  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>🔬 Quality Control — Spiny Tail</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{orders.length} order{orders.length === 1 ? '' : 's'} waiting inspection</p>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && orders.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 }}>No QC waiting 🎉</div>}

        {orders.map((o) => {
          const lst = listings[o.listing_id];
          const ven = vendors[o.vendor_id];
          return (
            <article key={o.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{lst?.title ?? 'Listing'}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    {ven?.business_name ?? 'Vendor'}{ven && ven.quality_rejections_count > 0 ? ` · ⚠ ${ven.quality_rejections_count} prior reject${ven.quality_rejections_count === 1 ? '' : 's'}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#f5c518' }}>{Number(o.quantity).toFixed(0)} {lst?.unit ?? ''}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>BSD ${Number(o.total_price).toFixed(2)}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
                Dropped off: {o.dropoff_at ? new Date(o.dropoff_at).toLocaleString() : '—'} · status {o.status}
              </div>

              <textarea value={notes[o.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [o.id]: e.target.value }))}
                rows={2} placeholder="QC notes (temperature, quality, packaging issues...)"
                style={{ width: '100%', marginTop: 10, padding: '8px 10px', borderRadius: 8, background: '#1a2e5a', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 13, fontFamily: 'inherit' }} />

              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button onClick={() => decide(o, true)}  style={{ ...act, background: '#16a34a' }}>✓ Pass — ready for BSC delivery</button>
                <button onClick={() => decide(o, false)} style={{ ...act, background: '#dc2626' }}>✕ Reject</button>
                {ven?.phone && <a href={`https://wa.me/${ven.phone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" style={{ ...act, background: '#25d366', textDecoration: 'none', display: 'inline-block' }}>💬 Vendor</a>}
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}

const pg: React.CSSProperties   = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif" };
const hdr: React.CSSProperties  = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties   = { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const card: React.CSSProperties = { background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 10 };
const act: React.CSSProperties  = { color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
