'use client';

// /dashboard/vendors/pending — admin queue for new vendor signups.
// Founder / co_founder / control_admin / manager only.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface VendorRow {
  id: string;
  business_name: string;
  vendor_type: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  government_id_number: string | null;
  license_number: string | null;
  location: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  approval_status: 'pending'|'approved'|'suspended'|'rejected';
  created_at: string;
}
interface DocRow { id: string; vendor_id: string; document_type: string; file_url: string; description: string | null; }

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','manager','basic_admin']);

export default function PendingVendorsPage() {
  const [rows, setRows]    = useState<VendorRow[]>([]);
  const [docs, setDocs]    = useState<Record<string, DocRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed]   = useState<boolean | null>(null);
  const [openId, setOpenId]   = useState<string | null>(null);
  const [notes,  setNotes]    = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/vendors/pending'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await load();
      setLoading(false);
    })();
  }, []);

  async function load() {
    const { data } = await supabase.from('vendors')
      .select('*').eq('approval_status', 'pending').order('created_at', { ascending: false });
    const list = (data ?? []) as VendorRow[];
    setRows(list);
    if (list.length > 0) {
      const ids = list.map((r) => r.id);
      const { data: d } = await supabase.from('vendor_documents').select('*').in('vendor_id', ids);
      const grouped: Record<string, DocRow[]> = {};
      for (const row of (d ?? []) as DocRow[]) {
        (grouped[row.vendor_id] ||= []).push(row);
      }
      setDocs(grouped);
    }
  }

  async function decide(id: string, status: 'approved' | 'rejected' | 'suspended') {
    const { data: { session } } = await supabase.auth.getSession();
    const note = notes[id]?.trim() || null;
    await supabase.from('vendors').update({
      approval_status: status,
      approved_by:     session?.user.id ?? null,
      approved_at:     new Date().toISOString(),
      approval_notes:  note,
    }).eq('id', id);
    await load();
  }

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>👥 Vendor signups — pending review</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{rows.length} application{rows.length === 1 ? '' : 's'} waiting</p>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && rows.length === 0 && <Empty>No pending vendor applications.</Empty>}

        {rows.map((v) => {
          const open = openId === v.id;
          const dList = docs[v.id] ?? [];
          return (
            <article key={v.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{v.business_name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    {v.vendor_type === 'fisherman' ? '🎣 Fisherman' : v.vendor_type === 'farmer' ? '🌱 Farmer' : '📦 Other'} · {v.location ?? '—'} · applied {new Date(v.created_at).toLocaleDateString()}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{v.contact_name ?? '(no name)'}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    {v.phone && <a href={`tel:${v.phone}`}     style={mini('#60a5fa')}>📞 {v.phone}</a>}
                    {v.phone && <a href={`sms:${v.phone}`}     style={mini('#94a3b8')}>💬 SMS</a>}
                    {v.phone && <a href={`https://wa.me/${v.phone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" style={mini('#25d366')}>WhatsApp</a>}
                    {v.email && <a href={`mailto:${v.email}`}  style={mini('#f5c518')}>✉ {v.email}</a>}
                  </div>
                </div>
                <button onClick={() => setOpenId(open ? null : v.id)} style={ghost}>{open ? 'Hide details' : 'Open'}</button>
              </div>

              {open && (
                <div style={{ marginTop: 12, padding: 12, background: '#0b1628', borderRadius: 8 }}>
                  <Row label="Government ID #" value={v.government_id_number || '—'} />
                  <Row label="License #"       value={v.license_number || '—'} />
                  <Row label="Bank account"    value={v.bank_account_name ? `${v.bank_account_name} · ${v.bank_account_number || '—'}` : '—'} />
                  <div style={{ marginTop: 8 }}>
                    <div style={lab}>Documents</div>
                    {dList.length === 0 ? <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>None uploaded.</p> : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 6 }}>
                        {dList.map((d) => d.document_type === 'video'
                          ? <a key={d.id} href={d.file_url} target="_blank" rel="noopener noreferrer" style={chip}>🎥 {d.document_type}</a>
                          // eslint-disable-next-line @next/next/no-img-element
                          : <a key={d.id} href={d.file_url} target="_blank" rel="noopener noreferrer"><img src={d.file_url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6 }} /></a>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <textarea value={notes[v.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [v.id]: e.target.value }))}
                      rows={2} placeholder="Notes (visible to you + vendor on approval/rejection)"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: '#1a2e5a', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 13, fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => decide(v.id, 'approved')}  style={{ ...act, background: '#16a34a' }}>✓ Approve</button>
                    <button onClick={() => decide(v.id, 'rejected')}  style={{ ...act, background: '#dc2626' }}>✕ Reject</button>
                    <button onClick={() => decide(v.id, 'suspended')} style={{ ...act, background: '#7a3e00' }}>⏸ Suspend</button>
                  </div>
                </div>
              )}
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
const ghost: React.CSSProperties= { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: 11, cursor: 'pointer' };
const lab: React.CSSProperties  = { fontSize: 10, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 };
const act: React.CSSProperties  = { color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const chip: React.CSSProperties = { display: 'inline-block', padding: '6px 10px', borderRadius: 8, background: 'rgba(245,197,24,0.15)', color: '#f5c518', textDecoration: 'none', fontSize: 11 };

function mini(color: string): React.CSSProperties {
  return { padding: '4px 8px', borderRadius: 6, fontSize: 11, color, background: `${color}15`, border: `1px solid ${color}40`, textDecoration: 'none' };
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 }}>{children}</div>;
}
function Row({ label, value }: { label: string; value: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13 }}>
    <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
    <span>{value}</span>
  </div>;
}
