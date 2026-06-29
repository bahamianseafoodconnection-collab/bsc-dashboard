'use client';

// app/founder/receiving/page.tsx  (G4)
//
// Founder receiving queue. Captured supplier invoices (with photo) land here.
// The founder matches each line to a product SKU, receives it into stock
// (record_inventory_in → inventory + current_stock, invoice + photo attached),
// and marks the bill paid / outstanding.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Line = { sku: string; qty: string; cost: string; name: string };
type Invoice = {
  id: string; created_at: string; supplier_name: string | null; invoice_ref: string | null;
  total_amount: number | null; balance_owed: number | null; status: string | null;
  items: unknown; image_urls: string[] | null; summary: string | null;
};
type Loc = { code: string; name: string };
type Prod = { sku: string; name: string };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';

async function api(path: string, init?: RequestInit) {
  const { data: { session } } = await sb().auth.getSession();
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

function parseLines(items: unknown): Line[] {
  let arr: unknown = items;
  if (typeof items === 'string') { try { arr = JSON.parse(items); } catch { return []; } }
  if (!Array.isArray(arr)) return [];
  return (arr as Array<Record<string, unknown>>).map((it) => ({
    name: String(it.name ?? it.description ?? it.item ?? ''),
    sku: String(it.sku ?? ''),
    qty: String(it.quantity ?? it.qty ?? ''),
    cost: String(it.cost_per_unit ?? it.cost ?? it.unit_price ?? it.price ?? ''),
  }));
}

export default function ReceivingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [products, setProducts] = useState<Prod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loc, setLoc] = useState('');
  const [mark, setMark] = useState<'paid' | 'outstanding'>('outstanding');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const j = await api('/api/founder/receiving');
    if (!j.ok) { setError(j.error || 'Founder only'); return; }
    setInvoices(j.invoices as Invoice[]);
    setLocations(j.locations as Loc[]);
    setProducts(j.products as Prod[]);
    if (!loc && (j.locations as Loc[]).length) setLoc((j.locations as Loc[])[0].code);
  }, [loc]);
  useEffect(() => { load(); }, [load]);

  function expand(inv: Invoice) {
    if (openId === inv.id) { setOpenId(null); return; }
    setOpenId(inv.id); setMsg(null); setMark('outstanding');
    setLines(parseLines(inv.items));
  }
  function setLine(i: number, k: keyof Line, v: string) {
    setLines((ls) => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
  }

  async function receive(inv: Invoice) {
    setBusy(true); setMsg(null);
    const payload = lines.filter((l) => l.sku.trim() && Number(l.qty) > 0)
      .map((l) => ({ sku: l.sku.trim(), quantity: Number(l.qty), cost_per_unit: l.cost ? Number(l.cost) : null }));
    if (payload.length === 0) { setBusy(false); setMsg('Enter a SKU + qty on at least one line.'); return; }
    const j = await api('/api/founder/receiving', { method: 'POST', body: JSON.stringify({ invoice_id: inv.id, location_code: loc, lines: payload, mark }) });
    setBusy(false);
    if (!j.ok) { setMsg(j.error || (j.errors?.length ? j.errors.join(' · ') : 'Receive failed')); return; }
    setMsg(`✓ Received ${j.received} line(s) → stock; invoice marked ${j.marked}.${j.errors?.length ? ' Issues: ' + j.errors.join(' · ') : ''}`);
    setOpenId(null); load();
  }

  const money = (n: number | null) => `$${Number(n ?? 0).toFixed(2)}`;

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <datalist id="sku-list">{products.map((p) => <option key={p.sku} value={p.sku}>{p.name}</option>)}</datalist>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>📦 Receiving</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Verify supplier invoices → receive into stock → mark paid/outstanding.</div></div>
          <Link href="/founder" style={pill}>← Founder</Link>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Receive to location:</span>
          <select value={loc} onChange={(e) => setLoc(e.target.value)} style={{ ...input, width: 'auto' }}>
            {locations.length === 0 && <option value="">(no locations)</option>}
            {locations.map((l) => <option key={l.code} value={l.code}>{l.name} ({l.code})</option>)}
          </select>
        </div>

        {invoices.length === 0 && <div style={{ color: '#64748b', fontSize: 14, padding: 20, textAlign: 'center' }}>No invoices awaiting receiving.</div>}

        {invoices.map((inv) => {
          const photo = Array.isArray(inv.image_urls) && inv.image_urls.length ? inv.image_urls[0] : null;
          const open = openId === inv.id;
          return (
            <div key={inv.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => expand(inv)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{inv.supplier_name || 'Unknown supplier'} <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{inv.invoice_ref}</span></div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{new Date(inv.created_at).toLocaleString()} · {Array.isArray(inv.items) ? inv.items.length : 0} lines · status {inv.status}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 17, fontWeight: 900, color: GOLD }}>{money(inv.total_amount)}</div>
                  {photo && <a href={photo} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ ...pill, display: 'inline-block', marginTop: 6, color: '#93c5fd', fontSize: 11 }}>🧾 Photo</a>}
                </div>
              </div>

              {open && (
                <div style={{ marginTop: 12, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>Match each line to a product SKU + received qty. Blank SKU = skip.</div>
                  {lines.length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>No line items extracted — add manually below is not supported; receive via a re-captured invoice.</div>}
                  {lines.map((l, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.8fr 0.8fr', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                      <div style={{ fontSize: 12, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.name}>{l.name || '—'}</div>
                      <input list="sku-list" value={l.sku} onChange={(e) => setLine(i, 'sku', e.target.value)} placeholder="SKU" style={input} />
                      <input value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} placeholder="qty" inputMode="decimal" style={input} />
                      <input value={l.cost} onChange={(e) => setLine(i, 'cost', e.target.value)} placeholder="cost" inputMode="decimal" style={input} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>Mark bill:</span>
                    {(['outstanding', 'paid'] as const).map((m) => (
                      <button key={m} onClick={() => setMark(m)} style={{ ...pill, cursor: 'pointer', background: mark === m ? GOLD : 'transparent', color: mark === m ? INK : '#cbd5e1', fontWeight: mark === m ? 800 : 500 }}>{m}</button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => receive(inv)} disabled={busy || !loc} style={{ ...pill, background: GOLD, color: INK, fontWeight: 900, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>{busy ? 'Receiving…' : '📦 Receive into stock'}</button>
                  </div>
                  {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#f87171', marginTop: 8 }}>{msg}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 10 };
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 12px' };
const input: React.CSSProperties = { width: '100%', padding: '7px 9px', borderRadius: 8, background: '#111c33', border: `1px solid ${BORDER}`, color: '#fff', fontSize: 13, boxSizing: 'border-box', outline: 'none' };
