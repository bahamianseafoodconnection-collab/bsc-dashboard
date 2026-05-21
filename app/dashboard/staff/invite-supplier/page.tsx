'use client';

// /dashboard/staff/invite-supplier
//
// One-click supplier portal onboarding. Founder picks an existing
// supplier from the list (e.g. Tropic Seafood) — or creates a new one —
// and types the contact's name + email + temp password. The API creates
// an auth user, a profile with role='supplier', and links the supplier
// row's auth_user_id. The supplier then logs in at /staff-login and
// lands on /supplier with permission to manage inventory + view sales.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);

interface SupplierLite {
  id:            string;
  name:          string;
  code:          string | null;
  contact_email: string | null;
  auth_user_id:  string | null;
}

export default function InviteSupplierPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);

  const [fullName,   setFullName]   = useState('');
  const [email,      setEmail]      = useState('');
  const [phone,      setPhone]      = useState('');
  const [whatsapp,   setWhatsapp]   = useState('');
  const [tempPw,     setTempPw]     = useState('BSC2024!');
  const [notes,      setNotes]      = useState('');
  const [supplierMode, setSupplierMode] = useState<'existing' | 'new'>('existing');
  const [supplierId, setSupplierId] = useState<string>('');
  const [newName,    setNewName]    = useState('');
  const [newCode,    setNewCode]    = useState('');

  const [busy,    setBusy]    = useState(false);
  const [result,  setResult]  = useState<{ ok: boolean; msg: string; details?: Record<string, unknown> } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/staff/invite-supplier'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/dashboard'; return; }
      setAuthed(true);
    })();
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name, code, contact_email, auth_user_id')
      .eq('is_active', true)
      .order('name');
    setSuppliers((data ?? []) as SupplierLite[]);
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  const selectedSupplier = useMemo(
    () => suppliers.find(s => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );

  async function submit() {
    setBusy(true); setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const body: Record<string, unknown> = {
        full_name:     fullName.trim(),
        email:         email.trim().toLowerCase(),
        phone:         phone.trim() || null,
        whatsapp:      whatsapp.trim() || phone.trim() || null,
        temp_password: tempPw.trim() || 'BSC2024!',
        notes:         notes.trim() || null,
      };
      if (supplierMode === 'existing' && supplierId) {
        body.supplier_id = supplierId;
      } else if (supplierMode === 'new' && newName.trim()) {
        body.new_supplier = {
          name:           newName.trim(),
          code:           newCode.trim() || null,
          contact_email:  email.trim().toLowerCase(),
          contact_phone:  phone.trim() || null,
        };
      } else {
        setResult({ ok: false, msg: 'Pick an existing supplier OR enter a new supplier name.' });
        return;
      }

      const res = await fetch('/api/admin/suppliers/invite', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setResult({ ok: false, msg: json.error ?? `Failed (${res.status})` });
        return;
      }
      setResult({
        ok: true,
        msg: `✓ ${fullName} provisioned. Email: ${email} · Temp password: ${json.temp_password ?? '(existing user — password unchanged)'}.\nThey log in at ${json.login_url} and land on ${json.landing_url}.`,
        details: json,
      });
      // Clear form for the next invite
      setFullName(''); setEmail(''); setPhone(''); setWhatsapp(''); setNotes('');
      setSupplierId(''); setNewName(''); setNewCode('');
      load();
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  }

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>🏷 Invite supplier portal user</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Creates an auth user, sets role=<code style={{ background: '#0b1628', padding: '0 4px', borderRadius: 3 }}>supplier</code>, links to a supplier record. They log in at <code style={{ background: '#0b1628', padding: '0 4px', borderRadius: 3 }}>/staff-login</code> and land on <code style={{ background: '#0b1628', padding: '0 4px', borderRadius: 3 }}>/supplier</code> to manage inventory.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
        <div style={card}>
          <label style={lbl}>Full name *</label>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Natasha Riley" style={inp} autoFocus />

          <label style={lbl}>Email * (used as login)</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tasha@tropic.com" style={inp} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
            <div>
              <label style={lbl}>Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="12424722007" style={inp} />
            </div>
            <div>
              <label style={lbl}>WhatsApp (defaults to phone)</label>
              <input type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="12424722007" style={inp} />
            </div>
          </div>

          <label style={lbl}>Temporary password</label>
          <input type="text" value={tempPw} onChange={e => setTempPw(e.target.value)} style={inp} />
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            Hand this to the supplier verbally / WhatsApp. They&apos;ll be able to change it after first login.
          </div>

          <label style={lbl}>Notes (optional — stored on the supplier record)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="e.g. Primary wholesale supplier · Manage inventory and online sales"
            style={{ ...inp, resize: 'vertical' }} />
        </div>

        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={() => setSupplierMode('existing')} style={chip(supplierMode === 'existing')}>Link to existing supplier</button>
            <button onClick={() => setSupplierMode('new')}      style={chip(supplierMode === 'new')}>Create new supplier</button>
          </div>

          {supplierMode === 'existing' ? (
            <>
              <label style={lbl}>Existing supplier</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} style={inp}>
                <option value="">— pick —</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id} disabled={!!s.auth_user_id}>
                    {s.code ? `${s.code} · ` : ''}{s.name}{s.auth_user_id ? ' (already linked)' : ''}
                  </option>
                ))}
              </select>
              {selectedSupplier?.auth_user_id && (
                <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4 }}>
                  ⚠ This supplier is already linked to another user — pick a different one or create new.
                </div>
              )}
            </>
          ) : (
            <>
              <label style={lbl}>New supplier name</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Tropic Seafood" style={inp} />
              <label style={lbl}>Short code (optional)</label>
              <input type="text" value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="TROPIC" style={inp} />
            </>
          )}
        </div>

        {result && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8,
            background: result.ok ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
            color:      result.ok ? '#4ade80' : '#f87171',
            border:    `1px solid ${result.ok ? '#16a34a' : '#f87171'}`,
            whiteSpace: 'pre-wrap', fontSize: 13 }}>
            {result.msg}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={submit} disabled={busy || !fullName.trim() || !email.trim()}
            style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: (busy || !fullName.trim() || !email.trim()) ? 0.5 : 1 }}>
            {busy ? 'Provisioning…' : '✓ Create supplier portal user'}
          </button>
        </div>
      </main>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const card: React.CSSProperties = { background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 10, padding: 14 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 4 };
const inp: React.CSSProperties = { background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const chip = (active: boolean): React.CSSProperties => ({
  background: active ? '#f5c518' : 'rgba(245,197,24,0.12)',
  color:      active ? '#060d1f' : '#f5c518',
  border:     '1px solid #f5c518',
  borderRadius: 16, padding: '4px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
});
