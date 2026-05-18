'use client';

// /dashboard/vendors/approved — manage active + suspended vendors.
// Founder / co_founder / control_admin / manager only.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface VendorRow {
  id: string; business_name: string; vendor_type: string; phone: string | null; email: string | null;
  location: string | null; approval_status: 'pending'|'approved'|'suspended'|'rejected';
  trust_tier: number; total_listings: number; total_sales: number; total_payouts: number;
  quality_rejections_count: number; created_at: string;
}

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','manager','basic_admin']);

export default function ApprovedVendorsPage() {
  const [rows,    setRows]    = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed,  setAuthed]  = useState<boolean | null>(null);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/vendors/approved'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await load();
      setLoading(false);
    })();
  }, []);

  async function load() {
    const { data } = await supabase.from('vendors')
      .select('*').in('approval_status', ['approved','suspended']).order('total_sales', { ascending: false }).limit(200);
    setRows((data ?? []) as VendorRow[]);
  }

  async function setStatus(id: string, status: 'approved' | 'suspended') {
    await supabase.from('vendors').update({ approval_status: status }).eq('id', id);
    await load();
  }
  async function setTier(id: string, tier: number) {
    await supabase.from('vendors').update({ trust_tier: tier }).eq('id', id);
    await load();
  }

  const filtered = rows.filter((v) => !search.trim() || v.business_name.toLowerCase().includes(search.toLowerCase()));

  if (authed === null) return <div style={pg}>Loading…</div>;
  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>👥 Active vendors</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{rows.length} total · sorted by sales</p>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor name…"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14, marginBottom: 12 }} />
        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && filtered.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 }}>No vendors yet.</div>}

        {filtered.map((v) => (
          <article key={v.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{v.business_name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{v.vendor_type} · {v.location ?? '—'} · Tier {v.trust_tier}{v.quality_rejections_count > 0 && ` · ${v.quality_rejections_count} QC reject${v.quality_rejections_count === 1 ? '' : 's'}`}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {v.phone && <a href={`tel:${v.phone}`} style={mini('#60a5fa')}>📞</a>}
                  {v.phone && <a href={`https://wa.me/${v.phone.replace(/\D/g,'')}`} style={mini('#25d366')}>WhatsApp</a>}
                  {v.email && <a href={`mailto:${v.email}`} style={mini('#f5c518')}>✉</a>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: '#f5c518' }}>${Number(v.total_sales).toFixed(2)} sales</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{v.total_listings} listings · ${Number(v.total_payouts).toFixed(2)} paid out</div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ background: v.approval_status === 'approved' ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)', color: v.approval_status === 'approved' ? '#4ade80' : '#f87171', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{v.approval_status}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {v.approval_status === 'approved'
                ? <button onClick={() => setStatus(v.id, 'suspended')} style={{ ...act, background: '#7a3e00' }}>⏸ Suspend</button>
                : <button onClick={() => setStatus(v.id, 'approved')}  style={{ ...act, background: '#16a34a' }}>▶ Reinstate</button>
              }
              {[1, 2, 3].map((t) => (
                <button key={t} disabled={v.trust_tier === t} onClick={() => setTier(v.id, t)}
                  style={{ ...act, background: v.trust_tier === t ? '#f5c518' : 'rgba(255,255,255,0.06)', color: v.trust_tier === t ? '#060d1f' : '#fff', opacity: v.trust_tier === t ? 1 : 0.7 }}>
                  Tier {t}
                </button>
              ))}
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}

const pg: React.CSSProperties   = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif" };
const hdr: React.CSSProperties  = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties   = { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const card: React.CSSProperties = { background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 10 };
const act: React.CSSProperties  = { color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' };
function mini(color: string): React.CSSProperties {
  return { padding: '4px 8px', borderRadius: 6, fontSize: 11, color, background: `${color}15`, border: `1px solid ${color}40`, textDecoration: 'none' };
}
