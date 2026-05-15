'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = [
  'founder', 'co_founder', 'control_admin', 'manager', 'supervisor',
  'cashier', 'right_hand', 'processor', 'driver', 'strategist',
  'supplier', 'partner_us',
];
const LOCATIONS = ['Nassau', 'Andros', 'all_locations'];

type Staff = {
  id: string;
  email: string | null;
  role: string | null;
  full_name?: string | null;
  name?: string | null;
  primary_location: string | null;
  is_active: boolean;
  activation_token: string | null;
  created_at?: string;
  last_login_at?: string | null;
  hourly_rate?: number | null;
  hours_per_week?: number | null;
  monthly_salary?: number | null;
  expense_id?: string | null;
};

// Singleton Supabase client — prevents multiple GoTrueClient instances
let _supabase: ReturnType<typeof createBrowserClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

async function authedFetch(action: string, body: Record<string, unknown> = {}) {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Admin-Secret': process.env.NEXT_PUBLIC_ADMIN_SECRET || 'bsc-founder-2026',
  };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch('/api/staff/admin', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...body }),
  });
  return res.json();
}

export default function StaffAdminPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'pending'>('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [origin, setOrigin] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [aEmail, setAEmail]     = useState('');
  const [aName, setAName]       = useState('');
  const [aRole, setARole]       = useState('cashier');
  const [aLocation, setALocation] = useState('Nassau');
  const [aHourly, setAHourly]   = useState('');
  const [aHours, setAHours]     = useState('40');
  const [aBusy, setABusy]       = useState(false);
  const [aError, setAError]     = useState<string | null>(null);
  const [newToken, setNewToken] = useState<{ name: string; link: string } | null>(null);

  const aMonthlyPreview = (() => {
    const hr  = Number(aHourly);
    const hpw = Number(aHours);
    if (!hr || !hpw || hr <= 0 || hpw <= 0) return null;
    return Math.round(hr * hpw * 52 / 12 * 100) / 100;
  })();

  useEffect(() => { setOrigin(window.location.origin); load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    const j = await authedFetch('list');
    if (!j.ok) {
      setError(j.error || 'Could not load staff');
      setStaff([]);
    } else {
      setStaff((j.users || []) as Staff[]);
    }
    setLoading(false);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setAError(null);
    if (!aEmail.trim() || !aName.trim()) { setAError('Name and email required'); return; }
    const hr  = aHourly ? Number(aHourly) : null;
    const hpw = aHours  ? Number(aHours)  : null;
    if ((aHourly && (!hr || hr <= 0)) || (aHours && (!hpw || hpw <= 0))) {
      setAError('Hourly rate and hours per week must be positive numbers.');
      return;
    }
    setABusy(true);
    const j = await authedFetch('create', {
      email: aEmail.trim(),
      full_name: aName.trim(),
      role: aRole,
      primary_location: aLocation,
      hourly_rate: hr,
      hours_per_week: hpw,
    });
    setABusy(false);
    if (!j.ok) { setAError(j.error || 'Create failed'); return; }
    setNewToken({ name: aName.trim(), link: `${origin}/staff/activate?token=${j.activation_token}` });
    setAEmail(''); setAName(''); setARole('cashier'); setALocation('Nassau');
    setAHourly(''); setAHours('40');
    load();
  }

  async function setActive(s: Staff, on: boolean) {
    setBusyId(s.id);
    await authedFetch('update', { id: s.id, is_active: on });
    setBusyId(null);
    load();
  }
  async function setRole(s: Staff, role: string) {
    setBusyId(s.id);
    await authedFetch('update', { id: s.id, role });
    setBusyId(null);
    load();
  }
  async function setLocation(s: Staff, primary_location: string) {
    setBusyId(s.id);
    await authedFetch('update', { id: s.id, primary_location });
    setBusyId(null);
    load();
  }
  async function regenerate(s: Staff) {
    setBusyId(s.id);
    const j = await authedFetch('regenerate_token', { id: s.id });
    setBusyId(null);
    if (j.ok) {
      const link = `${origin}/staff/activate?token=${j.activation_token}`;
      try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }
      alert(`New activation link copied to clipboard:\n\n${link}`);
      load();
    } else {
      alert(`Failed: ${j.error}`);
    }
  }
  async function resetPassword(s: Staff) {
    if (!s.email) { alert('No email on file'); return; }
    if (!confirm(`Send password-reset email to ${s.email}?`)) return;
    setBusyId(s.id);
    const j = await authedFetch('reset_password', { id: s.id });
    setBusyId(null);
    alert(j.ok ? 'Reset email sent.' : `Failed: ${j.error}`);
  }
  async function destroy(s: Staff) {
    if (!confirm(`Delete ${s.full_name || s.name || s.email} permanently? This cannot be undone.`)) return;
    setBusyId(s.id);
    const j = await authedFetch('delete', { id: s.id });
    setBusyId(null);
    if (!j.ok) alert(`Failed: ${j.error}`);
    load();
  }

  const filtered = useMemo(() => {
    return staff.filter((s) => {
      if (filter === 'active'  && !s.is_active) return false;
      if (filter === 'pending' && (s.is_active || !s.activation_token)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = [s.full_name, s.name, s.email, s.role, s.primary_location].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [staff, filter, search]);

  const counts = useMemo(() => {
    const c = { all: staff.length, active: 0, pending: 0 };
    for (const s of staff) {
      if (s.is_active) c.active += 1;
      else if (s.activation_token) c.pending += 1;
    }
    return c;
  }, [staff]);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0 }}>Staff</h1>
        <button
          onClick={() => { setShowAdd((v) => !v); setNewToken(null); }}
          style={{
            background: showAdd ? '#4b5563' : '#f5c518',
            color:      showAdd ? '#fff'    : '#060d1f',
            border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: 12, cursor: 'pointer',
          }}
        >
          {showAdd ? 'Cancel' : '+ Add staff'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10, marginBottom: 12 }}>
        <Stat label="Total"    value={counts.all}     accent="#cbd5e1" />
        <Stat label="Active"   value={counts.active}  accent="#22c55e" />
        <Stat label="Pending"  value={counts.pending} accent="#f5c518" />
      </div>

      {error && <ErrorBox text={error} />}

      {newToken && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', marginBottom: 6 }}>
            ✓ {newToken.name} created. Send them this activation link:
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              readOnly
              value={newToken.link}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 6, background: '#0a1628', border: '1px solid #1e3a5f', color: '#fff', fontSize: 11, fontFamily: 'monospace', boxSizing: 'border-box' }}
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={async () => {
                try { await navigator.clipboard.writeText(newToken.link); alert('Copied'); } catch { /* ignore */ }
              }}
              style={miniBtn('#22c55e')}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {showAdd && !newToken && (
        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#f5c518', marginBottom: 8 }}>+ New staff</div>
          <input value={aName} onChange={(e) => setAName(e.target.value)} placeholder="Full name" style={inputStyle} />
          <input value={aEmail} onChange={(e) => setAEmail(e.target.value)} placeholder="Email" type="email" style={inputStyle} />
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={aRole} onChange={(e) => setARole(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              {ALLOWED_ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
            <select value={aLocation} onChange={(e) => setALocation(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={aHourly}
              onChange={(e) => setAHourly(e.target.value)}
              placeholder="Hourly rate ($)"
              type="number" step="0.01" min="0"
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              value={aHours}
              onChange={(e) => setAHours(e.target.value)}
              placeholder="Hours per week"
              type="number" step="0.5" min="0"
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          {aMonthlyPreview !== null && (
            <div style={{
              background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 8,
              padding: '10px 12px', marginBottom: 8, fontSize: 13, color: '#fff',
            }}>
              <span style={{ color: '#94a3b8' }}>Auto-calculated monthly salary:</span>{' '}
              <span style={{ color: '#f5c518', fontWeight: 900 }}>${aMonthlyPreview.toFixed(2)}</span>
              <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
                ${Number(aHourly).toFixed(2)}/hr × {aHours} hr/wk × 52 ÷ 12. A row with this amount will be added to expenses (category=salaries) and linked to this staff member.
              </div>
            </div>
          )}
          {aError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 6 }}>{aError}</div>}
          <button
            onClick={create}
            disabled={aBusy}
            style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: aBusy ? 0.5 : 1 }}
          >
            {aBusy ? 'Creating…' : 'Create + generate activation link'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['all', 'active', 'pending'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...pillStyle,
              background: filter === f ? '#f5c518' : '#0d1f3c',
              color:      filter === f ? '#060d1f' : '#cbd5e1',
              border:     filter === f ? 'none'    : '1px solid #1e3a5f',
            }}
          >
            {f === 'all' ? `All (${counts.all})` : f === 'active' ? `Active (${counts.active})` : `Pending (${counts.pending})`}
          </button>
        ))}
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, role…" style={inputStyle} />

      {loading && <div style={{ color: '#94a3b8', padding: 12 }}>Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ color: '#94a3b8', padding: 12, textAlign: 'center' }}>No staff match those filters.</div>
      )}

      {filtered.map((s) => {
        const name = s.full_name || s.name || '(no name)';
        const tone = s.is_active ? '#22c55e' : s.activation_token ? '#f5c518' : '#94a3b8';
        const status = s.is_active ? 'active' : s.activation_token ? 'pending' : 'inactive';
        return (
          <div key={s.id} style={{ ...cardStyle, borderLeft: `4px solid ${tone}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, wordBreak: 'break-all' }}>
                  {s.email || '—'}
                  {s.last_login_at && (
                    <span style={{ color: '#cbd5e1' }}> · last login {new Date(s.last_login_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <span style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800, padding: '4px 8px', borderRadius: 999, color: '#060d1f', background: tone }}>
                {status}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
              <select value={s.role || 'cashier'} onChange={(e) => setRole(s, e.target.value)} disabled={busyId === s.id} style={selectInline}>
                {ALLOWED_ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
              <select value={s.primary_location || 'Nassau'} onChange={(e) => setLocation(s, e.target.value)} disabled={busyId === s.id} style={selectInline}>
                {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>

            {(s.hourly_rate != null || s.monthly_salary != null) && (
              <div style={{ marginTop: 8, padding: '6px 10px', background: '#0f1f3d', borderRadius: 8, fontSize: 11, color: '#cbd5e1' }}>
                {s.hourly_rate != null && s.hours_per_week != null && (
                  <span>${Number(s.hourly_rate).toFixed(2)}/hr × {Number(s.hours_per_week)} hr/wk</span>
                )}
                {s.monthly_salary != null && (
                  <span style={{ marginLeft: 8, color: '#f5c518', fontWeight: 800 }}>
                    = ${Number(s.monthly_salary).toFixed(2)}/mo
                  </span>
                )}
                {s.expense_id && (
                  <span style={{ marginLeft: 8, color: '#94a3b8', fontSize: 10 }}>· linked expense</span>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <button onClick={() => setActive(s, !s.is_active)} disabled={busyId === s.id} style={miniBtn(s.is_active ? '#94a3b8' : '#22c55e')}>
                {s.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button onClick={() => regenerate(s)} disabled={busyId === s.id} style={miniBtn('#f5c518')}>Regenerate link</button>
              <button onClick={() => resetPassword(s)} disabled={busyId === s.id} style={miniBtn('#a78bfa')}>Reset password</button>
              <button onClick={() => destroy(s)} disabled={busyId === s.id} style={miniBtn('#f87171')}>Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: accent || '#f5c518', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
      ⚠️ {text}
    </div>
  );
}

function miniBtn(color: string): React.CSSProperties {
  return { background: 'transparent', border: `1px solid ${color}`, color, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' };
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 720, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '12px 14px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const selectInline: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 12, outline: 'none' };
const pillStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
