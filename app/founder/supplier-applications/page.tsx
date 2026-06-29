'use client';

// app/founder/supplier-applications/page.tsx  (G13)
//
// Founder review of public fisherman/farmer signups. Approve → creates the
// supplier's login (invite) + activates the supplier → hands over credentials.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type App = { id: string; name: string | null; emoji: string | null; contact_phone: string | null; contact_email: string | null; vessel_name: string | null; vessel_registration_number: string | null; vessel_registration_doc_url: string | null; notes: string | null; created_at: string };
type Cred = { email: string; password: string | null };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';

async function api(path: string, init?: RequestInit) {
  const { data: { session } } = await sb().auth.getSession();
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

export default function SupplierApplicationsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cred, setCred] = useState<(Cred & { name: string }) | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const j = await api('/api/founder/supplier-applications');
    if (!j.ok) { setError(j.error || 'Founder only'); return; }
    setApps(j.applications as App[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function approve(a: App) {
    const email = (emails[a.id] ?? a.contact_email ?? '').trim();
    if (!email) { setError(`${a.name}: an email is required to create the login.`); return; }
    setBusy(a.id); setError(null);
    // 1) create the login (auth user + fisherman profile + link supplier)
    const inv = await api('/api/admin/fishermen/invite', { method: 'POST', body: JSON.stringify({ full_name: a.name, email, phone: a.contact_phone, supplier_id: a.id }) });
    if (!inv.ok) { setBusy(null); setError(inv.error || 'Invite failed'); return; }
    // 2) activate the supplier
    await api('/api/founder/supplier-applications', { method: 'POST', body: JSON.stringify({ action: 'activate', id: a.id }) });
    setBusy(null);
    setCred({ email, password: inv.temp_password ?? null, name: a.name || 'Supplier' });
    load();
  }
  async function reject(id: string) {
    setBusy(id);
    await api('/api/founder/supplier-applications', { method: 'POST', body: JSON.stringify({ action: 'reject', id }) });
    setBusy(null); load();
  }

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>🎣 Supplier / Boat Applications</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Public fisherman / farmer signups. Approve → creates their login.</div></div>
          <Link href="/founder" style={pill}>← Founder</Link>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}

        {cred && (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ color: '#4ade80', fontWeight: 800, fontSize: 13, marginBottom: 6 }}>✓ {cred.name} approved — hand over the login:</div>
            <div style={{ fontSize: 13 }}>Sign-in: <b>{typeof window !== 'undefined' ? window.location.origin : ''}/staff-login</b></div>
            <div style={{ fontSize: 13 }}>Email: <b style={{ fontFamily: 'monospace' }}>{cred.email}</b></div>
            {cred.password && <div style={{ fontSize: 13 }}>Temp password: <b style={{ fontFamily: 'monospace', color: GOLD }}>{cred.password}</b> (they change it on first sign-in)</div>}
            <button onClick={() => setCred(null)} style={{ ...pill, marginTop: 8, cursor: 'pointer' }}>Done</button>
          </div>
        )}

        {apps.length === 0 && <div style={{ color: '#64748b', fontSize: 14, padding: 20, textAlign: 'center' }}>No pending applications. 🎉</div>}

        {apps.map((a) => (
          <div key={a.id} style={card}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{a.emoji ?? '🎣'} {a.name || 'Applicant'}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
              {a.vessel_name ? `🛥 ${a.vessel_name} · ` : ''}{a.vessel_registration_number ? `Reg ${a.vessel_registration_number} · ` : ''}{a.contact_phone || 'no phone'} · {new Date(a.created_at).toLocaleDateString()}
            </div>
            {a.notes && <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>{a.notes}</div>}
            {a.vessel_registration_doc_url && <a href={a.vessel_registration_doc_url} target="_blank" rel="noreferrer" style={{ ...pill, display: 'inline-block', marginTop: 8, color: '#93c5fd', fontSize: 11 }}>📄 Registration cert</a>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={emails[a.id] ?? a.contact_email ?? ''} onChange={(e) => setEmails((m) => ({ ...m, [a.id]: e.target.value }))} placeholder="login email" style={input} />
              <div style={{ flex: 1 }} />
              <button onClick={() => approve(a)} disabled={busy === a.id} style={{ ...pill, cursor: 'pointer', background: GOLD, color: INK, fontWeight: 800 }}>{busy === a.id ? '…' : '✓ Approve → create login'}</button>
              <button onClick={() => reject(a.id)} disabled={busy === a.id} style={{ ...pill, cursor: 'pointer', color: '#f87171', borderColor: '#7f1d1d' }}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
const card: React.CSSProperties = { background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 10 };
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' };
const input: React.CSSProperties = { padding: '8px 11px', borderRadius: 8, background: '#111c33', border: `1px solid ${BORDER}`, color: '#fff', fontSize: 13, outline: 'none', width: 200, maxWidth: '45vw' };
