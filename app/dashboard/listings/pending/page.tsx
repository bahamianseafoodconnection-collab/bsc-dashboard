'use client';

// /dashboard/listings/pending — daily listing approval queue.
// Founder / co_founder / control_admin / manager only.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface ListingRow {
  id: string; vendor_id: string; title: string; description: string | null; product_type: string | null;
  quantity_available: number; unit: string; price_per_unit: number;
  harvest_status: string | null; harvest_or_catch_time: string | null;
  available_until: string | null; photos: string[]; videos: string[];
  dropoff_expected_at: string | null; created_at: string;
}
interface VendorMini { id: string; business_name: string; vendor_type: string; trust_tier: number; phone: string | null; }

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','manager','basic_admin']);

export default function PendingListingsPage() {
  const [rows,    setRows]    = useState<ListingRow[]>([]);
  const [vendors, setVendors] = useState<Record<string, VendorMini>>({});
  const [loading, setLoading] = useState(true);
  const [authed,  setAuthed]  = useState<boolean | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/listings/pending'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await load();
      setLoading(false);
    })();
  }, []);

  async function load() {
    const { data } = await supabase.from('vendor_listings')
      .select('*').eq('status', 'pending_approval').order('created_at', { ascending: false });
    const list = (data ?? []) as ListingRow[];
    setRows(list);
    if (list.length > 0) {
      const vids = Array.from(new Set(list.map((l) => l.vendor_id)));
      const { data: vs } = await supabase.from('vendors').select('id, business_name, vendor_type, trust_tier, phone').in('id', vids);
      const map: Record<string, VendorMini> = {};
      for (const v of (vs ?? []) as VendorMini[]) map[v.id] = v;
      setVendors(map);
    }
  }

  async function approve(id: string) {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('vendor_listings').update({
      status: 'live',
      approved_by: session?.user.id ?? null,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    }).eq('id', id);
    await load();
  }
  async function reject(id: string) {
    const r = reasons[id]?.trim() || 'Did not meet BSC quality standards.';
    await supabase.from('vendor_listings').update({ status: 'rejected', rejection_reason: r }).eq('id', id);
    await load();
  }

  if (authed === null) return <div style={pg}>Loading…</div>;
  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>📝 Listing approvals</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{rows.length} listing{rows.length === 1 ? '' : 's'} waiting</p>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && rows.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 }}>No pending listings 🎉</div>}

        {rows.map((l) => {
          const v = vendors[l.vendor_id];
          return (
            <article key={l.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{l.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    {v ? `${v.business_name} · ${v.vendor_type} · Tier ${v.trust_tier}` : '(vendor)'} · submitted {new Date(l.created_at).toLocaleString()}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#f5c518' }}>BSD ${Number(l.price_per_unit).toFixed(2)}/{l.unit}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{Number(l.quantity_available).toFixed(0)} {l.unit} available</div>
                </div>
              </div>

              {l.description && <p style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{l.description}</p>}

              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
                {l.harvest_status && <>Status: <strong>{l.harvest_status.replace(/_/g,' ')}</strong> · </>}
                {l.harvest_or_catch_time && <>Catch/harvest: {new Date(l.harvest_or_catch_time).toLocaleString()} · </>}
                {l.dropoff_expected_at && <>Spiny Tail dropoff: {new Date(l.dropoff_expected_at).toLocaleString()}</>}
              </div>

              {l.photos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 4, marginTop: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l.photos.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6 }} /></a>)}
                </div>
              )}
              {l.videos.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {l.videos.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer" style={{ marginRight: 8, padding: '4px 10px', borderRadius: 8, background: 'rgba(245,197,24,0.15)', color: '#f5c518', textDecoration: 'none', fontSize: 11 }}>🎥 Video {i+1}</a>)}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <textarea value={reasons[l.id] ?? ''} onChange={(e) => setReasons((r) => ({ ...r, [l.id]: e.target.value }))}
                  rows={2} placeholder="Rejection reason (only used if you click ✕ Reject)"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: '#1a2e5a', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 13, fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <button onClick={() => approve(l.id)} style={{ ...act, background: '#16a34a' }}>✓ Approve · go live</button>
                <button onClick={() => reject(l.id)}  style={{ ...act, background: '#dc2626' }}>✕ Reject</button>
                {v?.phone && <a href={`https://wa.me/${v.phone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" style={{ ...act, background: '#25d366', textDecoration: 'none', display: 'inline-block' }}>💬 WhatsApp vendor</a>}
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
