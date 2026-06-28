'use client';

// app/founder/invoice-import/page.tsx
//
// Founder-triggered "invoice → catalog" import. Pick a recorded supplier invoice
// + the supplier it's from, PREVIEW which line items are new (not in the
// catalog), then add the new ones to the REVIEW QUEUE (status='pending_approval'
// + needs_review, priced from the invoice cost). Nothing goes live without your
// go-live on the supplier screen.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Invoice = { id: string; invoice_ref: string | null; created_at: string; total_amount: number; item_count: number; summary: string | null };
type Supplier = { id: string; name: string };
type Unmatched = { name: string; cost_per_unit: number; unit_of_measure: string; sku: string };
type Preview = { matched_count: number; matched: string[]; unmatched: Unmatched[]; supplier: string };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';

async function authed(path: string, body?: unknown) {
  const { data: { session } } = await sb().auth.getSession();
  const opts: RequestInit = { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, cache: 'no-store' };
  if (body) { opts.method = 'POST'; opts.headers = { ...opts.headers, 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  const res = await fetch(path, opts);
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

export default function InvoiceImportPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = await authed('/api/supplier/invoice-import-data');
    if (!j.ok) { setError(j.error || 'Could not load invoices'); return; }
    setInvoices(j.invoices as Invoice[]); setSuppliers(j.suppliers as Supplier[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function doPreview() {
    if (!invoiceId || !supplierId) { setError('Pick an invoice and a supplier.'); return; }
    setBusy(true); setError(null); setResult(null); setPreview(null);
    const j = await authed('/api/supplier/invoice-auto-add', { invoice_id: invoiceId, supplier_id: supplierId, dry_run: true });
    setBusy(false);
    if (!j.ok) { setError(j.error || 'Preview failed'); return; }
    setPreview({ matched_count: j.matched_count, matched: j.matched ?? [], unmatched: j.unmatched ?? [], supplier: j.supplier });
  }

  async function doImport() {
    if (!preview || preview.unmatched.length === 0) return;
    if (!confirm(`Add ${preview.unmatched.length} new product(s) to ${preview.supplier}'s catalog as PENDING REVIEW?`)) return;
    setBusy(true); setError(null);
    const j = await authed('/api/supplier/invoice-auto-add', { invoice_id: invoiceId, supplier_id: supplierId });
    setBusy(false);
    if (!j.ok) { setError(j.error || 'Import failed'); return; }
    setResult(`✓ Added ${j.added} product(s) to ${j.supplier} as pending review. Go live from the supplier screen.`);
    setPreview(null);
  }

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>📥 Invoice → Catalog</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>New products on a supplier invoice get added to that supplier — as pending review, never auto-live.</div>
          </div>
          <Link href="/dashboard" style={pill}>← Dashboard</Link>
        </div>

        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}
        {result && <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid #22c55e', borderRadius: 10, padding: 12, marginBottom: 12, color: '#4ade80', fontWeight: 700, fontSize: 13 }}>{result}</div>}

        <div style={card}>
          <label style={lbl}>Recorded invoice</label>
          <select value={invoiceId} onChange={(e) => { setInvoiceId(e.target.value); setPreview(null); setResult(null); }} style={input}>
            <option value="">— pick a recorded invoice —</option>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>{(i.invoice_ref ?? i.id.slice(0, 8))} · {new Date(i.created_at).toLocaleDateString()} · {i.item_count} items · ${i.total_amount.toFixed(2)}</option>
            ))}
          </select>
          <label style={{ ...lbl, marginTop: 10 }}>Supplier this invoice is from</label>
          <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPreview(null); setResult(null); }} style={input}>
            <option value="">— pick the supplier —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={doPreview} disabled={busy || !invoiceId || !supplierId} style={{ ...btn(GOLD), marginTop: 12, width: '100%', opacity: busy || !invoiceId || !supplierId ? 0.5 : 1 }}>
            {busy ? 'Checking…' : '🔍 Preview new products'}
          </button>
        </div>

        {preview && (
          <div style={card}>
            <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>
              {preview.matched_count} line(s) already in the catalog · <strong style={{ color: GOLD }}>{preview.unmatched.length} new</strong>
            </div>
            {preview.unmatched.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 13 }}>Every line on this invoice already exists — nothing to add.</div>
            ) : (
              <>
                <div style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
                  {preview.unmatched.map((u, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid #16243f' }}>
                      <span>{u.name}</span>
                      <span style={{ color: '#94a3b8' }}>${u.cost_per_unit.toFixed(2)}/{u.unit_of_measure}</span>
                    </div>
                  ))}
                </div>
                <button onClick={doImport} disabled={busy} style={{ ...btn('#22c55e'), width: '100%' }}>
                  {busy ? 'Adding…' : `＋ Add ${preview.unmatched.length} to review queue`}
                </button>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Added as <strong>pending review</strong>, priced from invoice cost. Set category + go live on the supplier screen.</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
const card: React.CSSProperties = { background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 12 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 };
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: `1px solid ${BORDER}`, color: '#fff', fontSize: 14, boxSizing: 'border-box', outline: 'none' };
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 12px' };
function btn(color: string): React.CSSProperties { return { background: color === GOLD ? GOLD : 'transparent', color: color === GOLD ? INK : color, border: `1px solid ${color}`, borderRadius: 8, padding: '10px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }; }
