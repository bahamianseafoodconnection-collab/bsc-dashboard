'use client';

// app/labels/page.tsx
//
// Label print queue. Pulls printable items from two places:
//   1. yield_lots — single-output yield calc results (existing /yield flow)
//   2. processing_batch_outputs — multi-output batch detail (new in commit B)
//
// Each row: "Print label" button opens a 4×3 inch print preview that staff
// can send to a thermal printer or paper. Tracking code is the lot number
// or batch number — scannable in the future when we add a /lookup endpoint.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type YieldLot = {
  id: string;
  lot_number: string | null;
  tracking_code: string | null;
  product_name: string | null;
  fisherman_name: string | null;
  vessel_name: string | null;
  vessel_reg: string | null;
  captain_name: string | null;
  date_received: string | null;
  weight_in_lbs: number | null;
  weight_out_lbs: number | null;
  yield_pct: number | null;
  true_cost_per_lb: number | null;
  nassau_price: number | null;
  andros_price: number | null;
  online_price: number | null;
  wholesale_price: number | null;
  created_at: string;
};

type BatchOutput = {
  id: string;
  output_label: string;
  output_weight_lbs: number;
  effective_cost_per_lb: number;
  nassau_price_per_lb: number | null;
  andros_price_per_lb: number | null;
  online_price_per_lb: number | null;
  wholesale_price_per_lb: number | null;
  processing_batch_id: string;
  product_id: string | null;
  created_at: string;
  // joined fields
  batch_number: string | null;
  raw_product_name: string | null;
  captain_name: string | null;
  vessel_name: string | null;
  vessel_reg: string | null;
  best_before_date: string | null;
};

type LabelData = {
  source: 'yield_lot' | 'batch_output';
  id: string;
  product_name: string;
  tracking_code: string;
  lot_or_batch: string;
  weight_lbs: number | null;
  cost_per_lb: number | null;
  channel_prices: { nassau?: number; andros?: number; online?: number; wholesale?: number };
  fisherman: string | null;
  captain: string | null;
  vessel: string | null;
  vessel_reg: string | null;
  date_received: string | null;
  best_before: string | null;
};

export default function LabelsPage() {
  const [lots, setLots] = useState<YieldLot[]>([]);
  const [outputs, setOutputs] = useState<BatchOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<{ lots?: string; outputs?: string }>({});
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    setErrors({});
    const [lotRes, outRes] = await Promise.all([
      supabase
        .from('yield_lots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('processing_batch_outputs')
        .select(`
          id, output_label, output_weight_lbs, effective_cost_per_lb,
          nassau_price_per_lb, andros_price_per_lb,
          online_price_per_lb, wholesale_price_per_lb,
          processing_batch_id, product_id, created_at,
          processing_batches (
            batch_number, best_before_date,
            raw_product:products!processing_batches_raw_product_id_fkey (name),
            captain:captains!processing_batches_source_captain_id_fkey (name),
            vessel:vessels!processing_batches_source_vessel_id_fkey (name, registration)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    const errs: typeof errors = {};
    if (lotRes.error) errs.lots = lotRes.error.message;
    else setLots((lotRes.data || []) as YieldLot[]);

    if (outRes.error) errs.outputs = outRes.error.message;
    else {
      // Flatten the nested join into the BatchOutput shape used by the UI.
      // The shape of the join may vary by Supabase version — handle gracefully.
      const flat = (outRes.data || []).map((row: Record<string, unknown>) => {
        const pb = (row.processing_batches as Record<string, unknown>) || {};
        const rawProduct = (pb.raw_product as Record<string, unknown>) || {};
        const captain = (pb.captain as Record<string, unknown>) || {};
        const vessel = (pb.vessel as Record<string, unknown>) || {};
        return {
          ...row,
          batch_number: (pb.batch_number as string) ?? null,
          raw_product_name: (rawProduct.name as string) ?? null,
          captain_name: (captain.name as string) ?? null,
          vessel_name: (vessel.name as string) ?? null,
          vessel_reg: (vessel.registration as string) ?? null,
          best_before_date: (pb.best_before_date as string) ?? null,
        } as BatchOutput;
      });
      setOutputs(flat);
    }

    setErrors(errs);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Map both sources into a unified LabelData shape
  const labels: LabelData[] = useMemo(() => {
    const out: LabelData[] = [];
    for (const l of lots) {
      out.push({
        source: 'yield_lot',
        id: `lot-${l.id}`,
        product_name: l.product_name || 'Unnamed',
        tracking_code: l.tracking_code || (l.lot_number || '').slice(-6),
        lot_or_batch: l.lot_number || 'UNKNOWN',
        weight_lbs: l.weight_out_lbs,
        cost_per_lb: l.true_cost_per_lb,
        channel_prices: {
          nassau: l.nassau_price ?? undefined,
          andros: l.andros_price ?? undefined,
          online: l.online_price ?? undefined,
          wholesale: l.wholesale_price ?? undefined,
        },
        fisherman: l.fisherman_name,
        captain: l.captain_name,
        vessel: l.vessel_name,
        vessel_reg: l.vessel_reg,
        date_received: l.date_received,
        best_before: null,
      });
    }
    for (const o of outputs) {
      out.push({
        source: 'batch_output',
        id: `out-${o.id}`,
        product_name: o.output_label || o.raw_product_name || 'Unnamed',
        tracking_code: o.batch_number?.slice(-6) || o.id.slice(0, 6),
        lot_or_batch: o.batch_number || 'UNKNOWN',
        weight_lbs: o.output_weight_lbs,
        cost_per_lb: o.effective_cost_per_lb,
        channel_prices: {
          nassau: o.nassau_price_per_lb ?? undefined,
          andros: o.andros_price_per_lb ?? undefined,
          online: o.online_price_per_lb ?? undefined,
          wholesale: o.wholesale_price_per_lb ?? undefined,
        },
        fisherman: o.captain_name,
        captain: o.captain_name,
        vessel: o.vessel_name,
        vessel_reg: o.vessel_reg,
        date_received: null,
        best_before: o.best_before_date,
      });
    }
    return out;
  }, [lots, outputs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return labels;
    return labels.filter(
      (l) =>
        l.product_name.toLowerCase().includes(q) ||
        l.lot_or_batch.toLowerCase().includes(q) ||
        (l.captain || '').toLowerCase().includes(q)
    );
  }, [labels, search]);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0 }}>Label print queue</h1>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>
        Every yield lot + every multi-output batch SKU. Each label carries the
        full traceability chain: captain → vessel → batch → product.
      </p>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by product, batch/lot, or captain…"
        style={inputStyle}
      />

      {loading && <p style={{ color: '#94a3b8' }}>Loading…</p>}

      {errors.lots && <ErrorBox text={`yield_lots: ${errors.lots}`} />}
      {errors.outputs && <ErrorBox text={`processing_batch_outputs: ${errors.outputs}`} />}

      {!loading && filtered.length === 0 && !errors.lots && !errors.outputs && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
          No printable items yet. Capture a yield at /yield or a multi-output
          batch at /processor.
        </div>
      )}

      {filtered.map((l) => (
        <div key={l.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
                {l.product_name}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {l.source === 'yield_lot' ? 'Yield lot' : 'Batch output'} ·{' '}
                <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{l.lot_or_batch}</span>
                {l.captain ? ` · 🎣 ${l.captain}` : ''}
                {l.vessel ? ` · 🚤 ${l.vessel}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {l.weight_lbs != null && (
                <div style={{ fontSize: 14, fontWeight: 900, color: '#f5c518' }}>
                  {Number(l.weight_lbs).toFixed(1)} lb
                </div>
              )}
              {l.cost_per_lb != null && l.cost_per_lb > 0 && (
                <div style={{ fontSize: 11, color: '#16a34a' }}>
                  ${Number(l.cost_per_lb).toFixed(2)}/lb cost
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => printLabel(l)}
            style={{
              marginTop: 10,
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#f5c518',
              color: '#060d1f',
              fontSize: 12,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            🖨 Print label
          </button>
        </div>
      ))}
    </div>
  );
}

/* helpers */

function ErrorBox({ text }: { text: string }) {
  return (
    <div
      style={{
        background: 'rgba(248,113,113,0.1)',
        border: '1px solid #f87171',
        borderRadius: 10,
        padding: 12,
        color: '#f87171',
        fontSize: 12,
        fontWeight: 600,
        marginBottom: 8,
      }}
    >
      ⚠️ {text}
    </div>
  );
}

function printLabel(l: LabelData) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(l.product_name)} · ${escapeHtml(l.lot_or_batch)}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #fff; padding: 12px; }
        .label {
          width: 4in; min-height: 3in;
          border: 3px solid #1a2e5a; border-radius: 8px; padding: 14px;
          page-break-inside: avoid;
        }
        .header {
          display: flex; align-items: center; justify-content: space-between;
          border-bottom: 2px solid #1a2e5a; padding-bottom: 8px; margin-bottom: 10px;
        }
        .brand { font-size: 18px; font-weight: 900; color: #1a2e5a; }
        .sub   { font-size: 8px; color: #666; letter-spacing: 1px; text-transform: uppercase; }
        .lot   { background: #1a2e5a; color: #f4c842; font-size: 11px; font-weight: 900; padding: 4px 8px; border-radius: 4px; text-align: center; font-family: monospace; }
        .tracking { background: #f4c842; color: #1a2e5a; font-size: 10px; font-weight: 900; padding: 3px 8px; border-radius: 4px; text-align: center; margin-top: 3px; font-family: monospace; }
        .product-name { font-size: 22px; font-weight: 900; color: #1a2e5a; margin-bottom: 8px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .key { font-size: 9px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; }
        .val { font-size: 11px; font-weight: 700; color: #1a2e5a; text-align: right; }
        .divider { border-top: 1px dashed #ccc; margin: 8px 0; }
        .vessel-box { background: #f8f9fa; border-radius: 4px; padding: 8px; margin-bottom: 8px; }
        .vessel-title { font-size: 9px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
        .footer { border-top: 1px solid #1a2e5a; padding-top: 6px; margin-top: 8px; text-align: center; font-size: 8px; color: #999; }
        .barcode-area { text-align: center; margin: 6px 0; letter-spacing: 4px; font-size: 18px; color: #1a2e5a; font-family: monospace; }
        .channel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 6px 0; }
        .channel { font-size: 9px; padding: 4px; border-radius: 3px; background: #f0f4ff; color: #1a2e5a; display: flex; justify-content: space-between; }
        @media print {
          body { margin: 0; padding: 0; }
          .label { border: 3px solid #1a2e5a; }
        }
      </style>
    </head>
    <body>
      <div class="label">
        <div class="header">
          <div>
            <div class="brand">🐟 BSC Marketplace</div>
            <div class="sub">Bahamian Seafood Connection · Nassau</div>
          </div>
          <div>
            <div class="lot">${escapeHtml(l.lot_or_batch)}</div>
            <div class="tracking">TRK: ${escapeHtml(l.tracking_code)}</div>
          </div>
        </div>

        <div class="product-name">${escapeHtml(l.product_name)}</div>

        ${
          l.captain || l.vessel || l.date_received
            ? `
          <div class="vessel-box">
            <div class="vessel-title">🚢 Source</div>
            ${l.captain ? `<div class="row"><span class="key">Captain</span><span class="val">${escapeHtml(l.captain)}</span></div>` : ''}
            ${l.vessel ? `<div class="row"><span class="key">Vessel</span><span class="val">${escapeHtml(l.vessel)}</span></div>` : ''}
            ${l.vessel_reg ? `<div class="row"><span class="key">Reg #</span><span class="val">${escapeHtml(l.vessel_reg)}</span></div>` : ''}
            ${l.date_received ? `<div class="row"><span class="key">Received</span><span class="val">${escapeHtml(l.date_received)}</span></div>` : ''}
          </div>
        `
            : ''
        }

        <div class="divider"></div>

        ${l.weight_lbs != null ? `<div class="row"><span class="key">Weight</span><span class="val">${l.weight_lbs.toFixed(2)} lbs</span></div>` : ''}
        ${l.cost_per_lb != null && l.cost_per_lb > 0 ? `<div class="row"><span class="key">Cost basis</span><span class="val">$${l.cost_per_lb.toFixed(2)}/lb</span></div>` : ''}
        ${l.best_before ? `<div class="row"><span class="key">Best before</span><span class="val">${escapeHtml(l.best_before)}</span></div>` : ''}

        ${
          Object.values(l.channel_prices).some((v) => v != null)
            ? `
          <div class="channel-grid">
            ${l.channel_prices.nassau != null ? `<div class="channel"><span>🟡 Nassau</span><span>$${Number(l.channel_prices.nassau).toFixed(2)}</span></div>` : ''}
            ${l.channel_prices.andros != null ? `<div class="channel"><span>🟣 Andros</span><span>$${Number(l.channel_prices.andros).toFixed(2)}</span></div>` : ''}
            ${l.channel_prices.online != null ? `<div class="channel"><span>🛒 Online</span><span>$${Number(l.channel_prices.online).toFixed(2)}</span></div>` : ''}
            ${l.channel_prices.wholesale != null ? `<div class="channel"><span>📦 Wholesale</span><span>$${Number(l.channel_prices.wholesale).toFixed(2)}</span></div>` : ''}
          </div>
        `
            : ''
        }

        <div class="divider"></div>

        <div class="barcode-area">|||  ${escapeHtml(l.tracking_code)}  |||</div>

        <div class="footer">
          Scan tracking code to verify origin · BSC Marketplace · bscbahamas.com · +1 (242) 558-4495
        </div>
      </div>
    </body>
    </html>
  `;
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c] || c);
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 640, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
