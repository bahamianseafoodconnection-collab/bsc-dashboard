'use client';

// components/pos/EditPriceModal.tsx
//
// Modal Claff opens from a POS cart line to change the live selling
// price. She types the new Nassau (or Andros) price; we back-derive
// cost using the 5-channel + per-product VAT model and forward-compute
// every other channel's price so they stay in sync. POST to
// /api/products/cashier-price-edit handles the writes server-side.
//
// Live preview is shown above the Save button so Claff sees:
//   "Your new Nassau price → derived cost = $X.XX → other channels: …"

import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calculatePrice, vatPctForCategory, type PricingChannel } from '@/lib/pricing';

interface Props {
  product: {
    id:           string;
    sku:          string;
    name:         string;
    current_price: number;     // current Nassau (or Andros) price the cashier is editing FROM
  };
  channelSet?: 'nassau_pos' | 'andros_pos';  // which POS is open
  onClose: () => void;
  onSaved: (newPrice: number) => void;        // POS can swap the cart line's price immediately
}

const VAT_CATEGORIES = [
  { value: 'uncooked_food',   label: 'Uncooked food' },
  { value: 'cooked_prepared', label: 'Cooked / prepared' },
  { value: 'service',         label: 'Service' },
];

const CHANNEL_LABELS: Record<string, string> = {
  nassau_pos:         'Nassau POS',
  andros_pos:         'Andros POS',
  online_market:      'Online retail',
  wholesale_in_store: 'In-store wholesale',
  wholesale_online:   'Online wholesale',
};
const CHANNEL_MARKUP: Record<string, { pricingCh: PricingChannel; markup: number }> = {
  nassau_pos:         { pricingCh: 'nassau_pos',         markup: 40 },
  andros_pos:         { pricingCh: 'andros_pos',         markup: 40 },
  online_market:      { pricingCh: 'online_retail',      markup: 35 },
  wholesale_in_store: { pricingCh: 'wholesale_in_store', markup: 22 },
  wholesale_online:   { pricingCh: 'wholesale_online',   markup: 19 },
};

export default function EditPriceModal({ product, channelSet = 'nassau_pos', onClose, onSaved }: Props) {
  const [newPrice, setNewPrice] = useState<string>(product.current_price.toFixed(2));
  const [vatCategory, setVatCategory] = useState<string>('uncooked_food');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);

  // Load the product's current vat_category so the preview starts right.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('products').select('vat_category').eq('id', product.id).maybeSingle();
      const v = (data as { vat_category?: string | null } | null)?.vat_category;
      if (v) setVatCategory(v);
    })();
  }, [product.id]);

  // Live preview math — what the system will save when Claff clicks Save.
  const preview = useMemo(() => {
    const p = parseFloat(newPrice);
    if (!Number.isFinite(p) || p <= 0) return null;
    const vatPct = vatPctForCategory(vatCategory);
    const sourceMarkup = CHANNEL_MARKUP[channelSet].markup;
    // cost = price / (1 + markup) / (1 + vat)
    const derivedCost = p / (1 + sourceMarkup / 100) / (1 + vatPct / 100);
    const cost = Math.round(derivedCost * 10000) / 10000;
    // Forward-compute every channel.
    const channels: Array<{ db: string; price: number; markup: number }> = [];
    for (const [db, info] of Object.entries(CHANNEL_MARKUP)) {
      if (db === channelSet) {
        channels.push({ db, price: Math.round(p * 100) / 100, markup: info.markup });
      } else {
        const r = calculatePrice({ cost, channel: info.pricingCh, quantity: 1, unit: 'each', vatPct });
        channels.push({ db, price: Math.round(r.finalPrice * 100) / 100, markup: info.markup });
      }
    }
    return { cost, vatPct, channels };
  }, [newPrice, vatCategory, channelSet]);

  async function save() {
    const p = parseFloat(newPrice);
    if (!Number.isFinite(p) || p <= 0) { setErr('Enter a price greater than zero.'); return; }
    setBusy(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/products/cashier-price-edit', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          product_id:    product.id,
          new_pos_price: p,
          channel_set:   channelSet,
          reason:        reason.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error ?? `Save failed (${res.status})`);
        return;
      }
      onSaved(p);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200,
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#0f1f3d', color: '#fff', borderRadius: 14, padding: 18, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(245,197,24,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#f5c518', margin: 0 }}>✏ Edit selling price</h2>
          <button onClick={onClose} style={{ background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1 }} aria-label="Close">×</button>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 14 }}>
          {product.name} · <span style={{ fontFamily: 'monospace', color: '#f5c518' }}>{product.sku}</span>
          <br/>Editing on: <strong style={{ color: '#fbbf24' }}>{CHANNEL_LABELS[channelSet]}</strong>
        </div>

        <label style={lbl}>New {CHANNEL_LABELS[channelSet]} price (BSD)</label>
        <input
          type="number" step="0.01" min="0.01"
          value={newPrice}
          onChange={e => setNewPrice(e.target.value)}
          autoFocus
          style={{ ...inp, fontSize: 24, fontWeight: 900, color: '#f5c518', height: 56 }}
        />

        <label style={lbl}>Tax category</label>
        <select value={vatCategory} onChange={e => setVatCategory(e.target.value)} style={inp}>
          {VAT_CATEGORIES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>

        <label style={lbl}>Reason (optional — helps Dedrick when he reviews)</label>
        <input
          type="text" value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder='e.g. "Supplier raised cost", "Shelf tag changed"'
          style={inp}
        />

        {preview && (
          <div style={{ marginTop: 12, padding: 12, background: '#060d1f', borderRadius: 8, border: '1px solid rgba(74,222,128,0.3)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Live preview · Dedrick reviews in 4-5 days
            </div>
            <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 6 }}>
              Back-derived cost: <strong style={{ color: '#fff' }}>${preview.cost.toFixed(2)}</strong> · Tax 0%
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6 }}>
              {preview.channels.map(c => (
                <div key={c.db} style={{ background: '#0b1628', borderRadius: 6, padding: '6px 8px', border: c.db === channelSet ? '1px solid #f5c518' : '1px solid rgba(245,197,24,0.15)' }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
                    {CHANNEL_LABELS[c.db]}
                    {c.db === channelSet && <span style={{ color: '#f5c518', marginLeft: 4 }}>← you</span>}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#f5c518' }}>${c.price.toFixed(2)}</div>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>{c.markup}% markup</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {err && (
          <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(248,113,113,0.18)', color: '#f87171', border: '1px solid #f87171', borderRadius: 6, fontSize: 12 }}>
            ⚠ {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onClose} disabled={busy}
            style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
            Cancel
          </button>
          <button onClick={save} disabled={busy || !preview}
            style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: (busy || !preview) ? 0.5 : 1 }}>
            {busy ? 'Saving…' : '✓ Save price'}
          </button>
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 4 };
const inp: React.CSSProperties = { background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '8px 10px', fontSize: 14, width: '100%', boxSizing: 'border-box' };
