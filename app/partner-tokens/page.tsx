'use client';

// app/partner-tokens/page.tsx
//
// Founder admin for generating + managing partner-portal access tokens.
// Pick a supplier, label the link, optionally set expiry, get back a
// shareable URL to send via WhatsApp.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
};

type TokenRow = {
  id: string;
  token: string;
  supplier_id: string;
  label: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
  supplier?: Supplier | Supplier[] | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createBrowserClient(url, key);
}

async function authedFetch(action: string, body: Record<string, unknown> = {}) {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch('/api/partner-portal/admin', {
    method: 'POST', headers,
    body: JSON.stringify({ action, ...body }),
  });
  return res.json();
}

export default function PartnerTokensPage() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  // Create form
  const [supplierId, setSupplierId] = useState('');
  const [label, setLabel] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState<{ link: string; supplier: string } | null>(null);

  useEffect(() => { setOrigin(window.location.origin); load(); loadSuppliers(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    const j = await authedFetch('list');
    if (!j.ok) {
      setError(j.error || 'Could not load tokens');
      setTokens([]);
    } else {
      const normalized = ((j.tokens || []) as TokenRow[]).map((t) => ({
        ...t,
        supplier: Array.isArray(t.supplier) ? t.supplier[0] ?? null : t.supplier,
      }));
      setTokens(normalized);
    }
    setLoading(false);
  }

  async function loadSuppliers() {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('suppliers')
      .select('id, name, contact_name, contact_phone')
      .order('name', { ascending: true });
    setSuppliers((data || []) as Supplier[]);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) return;
    setCreating(true);
    const j = await authedFetch('create', {
      supplier_id: supplierId,
      label: label.trim() || null,
      expires_in_days: expiresInDays ? Number(expiresInDays) : null,
    });
    setCreating(false);
    if (!j.ok) { alert(`Failed: ${j.error}`); return; }
    const supplierName = suppliers.find((s) => s.id === supplierId)?.name || 'Partner';
    const link = `${origin}/partner/${j.token}`;
    setNewLink({ link, supplier: supplierName });
    try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }
    setLabel('');
    setExpiresInDays('');
    load();
  }

  async function revoke(t: TokenRow) {
    if (!confirm('Revoke this link? Anyone who has the URL will lose access immediately.')) return;
    await authedFetch('revoke', { token_id: t.id });
    load();
  }
  async function destroy(t: TokenRow) {
    if (!confirm('Delete this link permanently?')) return;
    await authedFetch('delete', { token_id: t.id });
    load();
  }

  const grouped = useMemo(() => {
    const m = new Map<string, TokenRow[]>();
    for (const t of tokens) {
      const sup = t.supplier as Supplier | null;
      const key = sup?.name || 'Unknown';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tokens]);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>

      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0, marginBottom: 6 }}>
        Partner Portal Links
      </h1>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>
        Generate per-partner shareable URLs. Send via WhatsApp. Token IS the auth — no login needed.
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, marginBottom: 12 }}>
          ⚠️ {error}
          {error.toLowerCase().includes('relation') && (
            <div style={{ marginTop: 6 }}>Run sql/2026-05-09-partner-portal.sql in Supabase SQL editor.</div>
          )}
        </div>
      )}

      {newLink && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', marginBottom: 6 }}>
            ✓ New link for {newLink.supplier} — copied to clipboard:
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              readOnly
              value={newLink.link}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 6, background: '#0a1628', border: '1px solid #1e3a5f', color: '#fff', fontSize: 11, fontFamily: 'monospace', boxSizing: 'border-box' }}
              onFocus={(e) => e.target.select()}
            />
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Your BSC Partner Portal link: ${newLink.link}`)}`}
              target="_blank" rel="noreferrer"
              style={miniBtn('#22c55e')}
            >
              📲 WhatsApp
            </a>
          </div>
        </div>
      )}

      <form onSubmit={create} style={cardStyle}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#f5c518', marginBottom: 8 }}>+ Generate new link</div>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inputStyle} required>
          <option value="">— Choose partner —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. 'Bob's main link', 'Bob's accountant') - optional"
          style={inputStyle}
        />
        <input
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(e.target.value)}
          type="number"
          min={1}
          placeholder="Expires in N days (blank = never)"
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={creating || !supplierId}
          style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: (creating || !supplierId) ? 0.5 : 1 }}
        >
          {creating ? 'Creating…' : 'Generate link + copy URL'}
        </button>
      </form>

      <div style={{ marginTop: 14 }}>
        {loading && <div style={{ color: '#94a3b8', padding: 12 }}>Loading…</div>}
        {!loading && tokens.length === 0 && (
          <div style={{ color: '#94a3b8', padding: 12, textAlign: 'center' }}>
            No partner links yet. Generate one above.
          </div>
        )}

        {grouped.map(([supplierName, group]) => (
          <div key={supplierName} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#f5c518', marginBottom: 6 }}>
              {supplierName}
            </div>
            {group.map((t) => {
              const live = !t.revoked_at && (!t.expires_at || new Date(t.expires_at) > new Date());
              const tone = live ? '#22c55e' : '#f87171';
              const status = t.revoked_at ? 'revoked' : (t.expires_at && new Date(t.expires_at) < new Date()) ? 'expired' : 'active';
              const link = `${origin}/partner/${t.token}`;
              return (
                <div key={t.id} style={{ ...cardStyle, borderLeft: `4px solid ${tone}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
                        {t.label || '(no label)'}
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                        Created {new Date(t.created_at).toLocaleDateString()}
                        {t.last_accessed_at && ` · last viewed ${new Date(t.last_accessed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                        {t.expires_at && ` · expires ${new Date(t.expires_at).toLocaleDateString()}`}
                      </div>
                    </div>
                    <span style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800, padding: '4px 8px', borderRadius: 999, color: '#060d1f', background: tone }}>
                      {status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input
                      readOnly
                      value={link}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 4, background: '#0a1628', border: '1px solid #1e3a5f', color: '#cbd5e1', fontSize: 10, fontFamily: 'monospace', boxSizing: 'border-box' }}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      onClick={async () => { try { await navigator.clipboard.writeText(link); alert('Copied'); } catch { /* ignore */ } }}
                      style={miniBtn('#cbd5e1')}
                    >
                      Copy
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Your BSC Partner Portal link: ${link}`)}`}
                      target="_blank" rel="noreferrer"
                      style={miniBtn('#22c55e')}
                    >
                      📲 WhatsApp it
                    </a>
                    {!t.revoked_at && (
                      <button onClick={() => revoke(t)} style={miniBtn('#f5c518')}>
                        Revoke
                      </button>
                    )}
                    <button onClick={() => destroy(t)} style={miniBtn('#f87171')}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function miniBtn(color: string): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${color}`,
    color,
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
    whiteSpace: 'nowrap',
  };
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 720, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '12px 14px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
