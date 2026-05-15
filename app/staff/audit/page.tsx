'use client';

// app/staff/audit/page.tsx
//
// Founder / co-founder review of every staff change:
//   create / update / deactivate / reactivate / regenerate_token /
//   reset_password / delete.
//
// Reads from /api/staff/admin (action='audit'), which returns the last 100
// staff_changes rows. Resolves user_id + changed_by to full names by also
// pulling the staff list (action='list') in parallel.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

interface ChangeRow {
  id: string;
  user_id: string | null;
  action: string;
  changed_by: string | null;
  changed_at: string;
  details: Record<string, unknown> | null;
}

interface StaffRow {
  id: string;
  full_name?: string | null;
  name?: string | null;
  email: string | null;
}

const ACTION_TONES: Record<string, { bg: string; fg: string; label: string }> = {
  create:            { bg: '#16a34a', fg: '#fff',   label: 'CREATE' },
  update:            { bg: '#1a6fb5', fg: '#fff',   label: 'UPDATE' },
  deactivate:        { bg: '#94a3b8', fg: '#060d1f', label: 'DEACTIVATE' },
  reactivate:        { bg: '#f5c518', fg: '#060d1f', label: 'REACTIVATE' },
  regenerate_token:  { bg: '#a78bfa', fg: '#060d1f', label: 'TOKEN' },
  reset_password:    { bg: '#7c3aed', fg: '#fff',   label: 'RESET PW' },
  delete:            { bg: '#dc2626', fg: '#fff',   label: 'DELETE' },
};

let _supabase: ReturnType<typeof createBrowserClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function nameOf(map: Map<string, StaffRow>, id: string | null): string {
  if (!id) return '—';
  const row = map.get(id);
  if (!row) return id.slice(0, 8) + '…';
  return row.full_name || row.name || row.email || id.slice(0, 8) + '…';
}

type Filter = 'all' | 'create' | 'update' | 'deactivate' | 'reactivate' | 'regenerate_token' | 'reset_password' | 'delete';

export default function StaffAuditPage() {
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [staff, setStaff]     = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState<Filter>('all');
  const [search, setSearch]   = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setError(null);
    const [auditRes, listRes] = await Promise.all([
      authedFetch('audit'),
      authedFetch('list'),
    ]);
    if (!auditRes.ok) {
      setError(auditRes.error || 'Could not load audit log.');
      setChanges([]);
    } else {
      setChanges((auditRes.changes || []) as ChangeRow[]);
    }
    if (listRes.ok) setStaff((listRes.users || []) as StaffRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const staffById = useMemo(() => {
    const m = new Map<string, StaffRow>();
    for (const s of staff) m.set(s.id, s);
    return m;
  }, [staff]);

  const filtered = useMemo(() => {
    return changes.filter((c) => {
      if (filter !== 'all' && c.action !== filter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const targetName = nameOf(staffById, c.user_id).toLowerCase();
        const actorName  = nameOf(staffById, c.changed_by).toLowerCase();
        const detailsStr = c.details ? JSON.stringify(c.details).toLowerCase() : '';
        const hay = [c.action, targetName, actorName, detailsStr].join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [changes, filter, search, staffById]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of changes) c[r.action] = (c[r.action] ?? 0) + 1;
    return c;
  }, [changes]);

  function toggleDetails(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div style={pgStyle}>
      <Link href="/staff" style={backStyle}>← Staff</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0, fontFamily: "'Playfair Display', serif" }}>Staff change log</h1>
        <button onClick={load} disabled={loading} style={{ background: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 12 }}>
        Last 100 staff changes — who, what, when. Founder + co_founder visibility.
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search staff name, action, or details…"
        style={inputStyle}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {(['all','create','update','deactivate','reactivate','regenerate_token','reset_password','delete'] as Filter[]).map((f) => {
          const active = filter === f;
          const count  = f === 'all' ? changes.length : (counts[f] ?? 0);
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                ...pillStyle,
                background: active ? '#f5c518' : '#0d1f3c',
                color:      active ? '#060d1f' : '#cbd5e1',
                border:     active ? 'none'    : '1px solid #1e3a5f',
              }}
            >
              {f === 'all' ? 'All' : (ACTION_TONES[f]?.label || f.toUpperCase())} <span style={{ opacity: 0.6, marginLeft: 4 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
          ⚠️ {error}
        </div>
      )}

      {loading && <div style={{ color: '#94a3b8', fontSize: 13, padding: 12 }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: '24px 12px', textAlign: 'center' }}>
          {changes.length === 0
            ? 'No staff changes recorded yet.'
            : 'No changes match the current filter.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((c) => {
          const tone = ACTION_TONES[c.action] || { bg: '#475569', fg: '#fff', label: c.action.toUpperCase() };
          const targetName = nameOf(staffById, c.user_id);
          const actorName  = nameOf(staffById, c.changed_by);
          const isOpen     = openIds.has(c.id);
          const hasDetails = !!c.details && Object.keys(c.details).length > 0;
          return (
            <div key={c.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 900, padding: '4px 10px', borderRadius: 999, background: tone.bg, color: tone.fg, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                  {tone.label}
                </span>
                <span title={fmtTime(c.changed_at)} style={{ color: '#94a3b8', fontSize: 11 }}>
                  {timeAgo(c.changed_at)} · {fmtTime(c.changed_at)}
                </span>
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: '#fff' }}>
                <span style={{ fontWeight: 800 }}>{actorName}</span>
                <span style={{ color: '#94a3b8' }}> changed </span>
                <span style={{ fontWeight: 800 }}>{targetName}</span>
              </div>
              {hasDetails && (
                <>
                  <button
                    type="button"
                    onClick={() => toggleDetails(c.id)}
                    style={{ marginTop: 8, background: 'transparent', color: '#f5c518', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {isOpen ? 'Hide details' : 'Show details'}
                  </button>
                  {isOpen && (
                    <pre style={{ marginTop: 8, padding: 10, background: '#060d1f', color: '#cbd5e1', borderRadius: 8, border: '1px solid #1e3a5f', fontSize: 11, overflowX: 'auto', fontFamily: 'monospace' }}>
                      {JSON.stringify(c.details, null, 2)}
                    </pre>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const pgStyle: React.CSSProperties = {
  padding: 16,
  background: '#060d1f',
  minHeight: '100vh',
  color: '#fff',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  paddingBottom: 80,
  maxWidth: 760,
  margin: '0 auto',
};

const backStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'rgba(245,197,24,0.1)',
  border: '1px solid rgba(245,197,24,0.4)',
  borderRadius: 8,
  color: '#f5c518',
  fontWeight: 700,
  fontSize: 12,
  padding: '6px 12px',
  marginBottom: 12,
  textDecoration: 'none',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  background: '#111c33',
  border: '1px solid #1e2d4a',
  color: '#fff',
  fontSize: 14,
  marginBottom: 10,
  boxSizing: 'border-box' as const,
  outline: 'none',
};

const pillStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
};

const cardStyle: React.CSSProperties = {
  background: '#0d1f3c',
  border: '1px solid #1e3a5f',
  borderRadius: 12,
  padding: '12px 14px',
};
