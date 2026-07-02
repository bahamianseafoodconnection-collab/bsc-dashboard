'use client';

// Products card — the receiving-product catalog (spinytails_species). Processors
// add every product received from boats (Conch, Lobster, Grouper, …). Each
// product's batch prefix becomes its batch-number prefix (GRO-YYYYMMDD-001).
// Active products fill Card 1's "Product type" dropdown.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const NAVY = '#060e1c', GOLD = '#c8860f';

interface Product { code: string; name: string; scientific_name: string | null; active: boolean; shelf_life_months: number | null; ccp_limits: Record<string, number> | null; }

export default function ProductsCard({ onProductsChanged }: { onProductsChanged?: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [codeEdited, setCodeEdited] = useState(false);
  const [sci, setSci] = useState(''); const [shelf, setShelf] = useState(''); const [freshMax, setFreshMax] = useState(''); const [frozenMax, setFrozenMax] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const api = useCallback(async (init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/processor/products', { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' });
    return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  }, []);

  const load = useCallback(async () => {
    const j = await api();
    if (j.ok) setProducts(j.products as Product[]);
  }, [api]);
  useEffect(() => { load(); }, [load]);

  function flash(ok: boolean, text: string) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); }

  function onName(v: string) {
    setName(v);
    if (!codeEdited) setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3));
  }

  async function add() {
    if (!name.trim()) { flash(false, 'Product name is required.'); return; }
    if (code.trim().length < 2) { flash(false, 'Batch prefix must be 2–4 letters (e.g. GRO).'); return; }
    setBusy(true);
    const j = await api({ method: 'POST', body: JSON.stringify({
      name: name.trim(), code: code.trim(), scientific_name: sci.trim() || null,
      shelf_life_months: shelf ? parseInt(shelf, 10) : null,
      fresh_max_f: freshMax ? parseFloat(freshMax) : null, frozen_max_f: frozenMax ? parseFloat(frozenMax) : null,
    }) });
    setBusy(false);
    if (!j.ok) { flash(false, j.error || 'Add failed'); return; }
    flash(true, `✓ Added ${j.name} (batch prefix ${j.code}-)`);
    setName(''); setCode(''); setCodeEdited(false); setSci(''); setShelf(''); setFreshMax(''); setFrozenMax(''); setOpen(false);
    await load(); onProductsChanged?.();
  }

  async function toggle(p: Product) {
    const j = await api({ method: 'PATCH', body: JSON.stringify({ code: p.code, active: !p.active }) });
    if (!j.ok) { flash(false, j.error || 'Update failed'); return; }
    await load(); onProductsChanged?.();
  }

  const inp: React.CSSProperties = { width: '100%', padding: 12, fontSize: 16, border: '1px solid #2a3a52', borderRadius: 10, marginTop: 6, background: '#0c1729', color: '#fff', boxSizing: 'border-box' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: '#8ea3c0', textTransform: 'uppercase', letterSpacing: 0.5 };
  const card: React.CSSProperties = { background: '#0b1424', border: '1px solid rgba(200,134,15,0.25)', borderRadius: 14, padding: 16, marginBottom: 14 };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: GOLD }}>🐟 Products <span style={{ fontSize: 12, fontWeight: 700, color: '#8ea3c0' }}>· received from boats · {products.length}</span></div>
        <button onClick={() => setOpen(o => !o)} style={{ fontSize: 12, fontWeight: 800, padding: '5px 10px', borderRadius: 8, border: `1px solid ${GOLD}`, background: 'transparent', color: GOLD, cursor: 'pointer' }}>{open ? '✕ Close' : '＋ Add product'}</button>
      </div>

      {msg && <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, fontWeight: 700, fontSize: 13, background: msg.ok ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)', color: msg.ok ? '#4ade80' : '#f87171' }}>{msg.text}</div>}

      {open && (
        <div style={{ padding: 12, borderRadius: 10, background: '#0c1729', border: '1px solid #1c2c44', marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <div><div style={lbl}>Product name *</div><input value={name} onChange={e => onName(e.target.value)} placeholder="e.g. Grouper" style={inp} /></div>
            <div><div style={lbl}>Batch prefix *</div><input value={code} onChange={e => { setCodeEdited(true); setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)); }} placeholder="GRO" style={inp} /></div>
          </div>
          <div><div style={lbl}>Scientific name (optional)</div><input value={sci} onChange={e => setSci(e.target.value)} style={inp} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><div style={lbl}>Shelf life (mo)</div><input type="number" inputMode="numeric" value={shelf} onChange={e => setShelf(e.target.value)} placeholder="24" style={inp} /></div>
            <div><div style={lbl}>Fresh max °F</div><input type="number" inputMode="decimal" value={freshMax} onChange={e => setFreshMax(e.target.value)} placeholder="opt" style={inp} /></div>
            <div><div style={lbl}>Frozen max °F</div><input type="number" inputMode="decimal" value={frozenMax} onChange={e => setFrozenMax(e.target.value)} placeholder="opt" style={inp} /></div>
          </div>
          <div style={{ fontSize: 11, color: '#5a6b85', marginTop: 6 }}>Batch numbers will read <b style={{ color: GOLD }}>{(code || 'XXX')}-YYYYMMDD-001</b>. Temp limits are optional CCP-1 checks.</div>
          <button onClick={add} disabled={busy} style={{ width: '100%', marginTop: 10, padding: 12, borderRadius: 10, fontWeight: 900, fontSize: 14, background: busy ? '#3a4a63' : GOLD, color: NAVY, border: 'none', cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Saving…' : '✓ Save product'}</button>
        </div>
      )}

      {products.length === 0 ? (
        <div style={{ color: '#8ea3c0', fontSize: 13 }}>No products yet. Add every product you receive (Conch, Lobster, Grouper…) so the receiving log can accept them.</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {products.map(p => (
            <div key={p.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: '#0c1729', border: '1px solid #1c2c44', opacity: p.active ? 1 : 0.5 }}>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <b>{p.name}</b> <span style={{ color: '#5a6b85' }}>· {p.code}-</span>
                <div style={{ color: '#8ea3c0', fontSize: 12 }}>⏳ {p.shelf_life_months ?? 24} mo{p.ccp_limits?.frozen_max_f != null ? ` · frozen ≤ ${p.ccp_limits.frozen_max_f}°F` : ''}{p.ccp_limits?.fresh_max_f != null ? ` · fresh ≤ ${p.ccp_limits.fresh_max_f}°F` : ''}</div>
              </div>
              <button onClick={() => toggle(p)} style={{ fontSize: 11.5, fontWeight: 800, padding: '5px 10px', borderRadius: 8, border: '1px solid', borderColor: p.active ? '#16a34a' : '#2a3a52', background: 'transparent', color: p.active ? '#4ade80' : '#8ea3c0', cursor: 'pointer', whiteSpace: 'nowrap' }}>{p.active ? '● Active' : '○ Off'}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
