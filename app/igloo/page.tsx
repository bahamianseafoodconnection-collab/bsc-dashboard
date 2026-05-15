'use client';

// app/igloo/page.tsx
//
// Build #6 - Igloo Integration. The final piece of the lobster pipeline.
// Tracks BSC's full export workflow through Igloo Miami:
//   - Shipments OUT (Spiny Tail Nassau -> Igloo Miami via freight forwarder)
//   - Sales executed by Igloo on BSC's behalf to global buyers
//   - Per-shipment P&L (revenue minus Igloo commission + processing + storage)
//   - Inventory remaining at Igloo (shipped - sold)
//   - Net to BSC after all Igloo deductions
//
// Three sections in one page (tabbed). Inline-styled, mobile-friendly.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';

export const dynamic = 'force-dynamic';

const FREIGHT_FORWARDERS = ['Ship X', 'King Ocean', 'Tropical Shipping', 'Other'];

type Shipment = {
  id: string;
  shipment_date: string | null;
  freight_forwarder: string | null;
  freight_cost_usd: number | null;
  cooler_count: number | null;
  total_weight_lb: number;
  total_cost_basis_bsd: number | null;
  status: string;
  igloo_advance_amount_usd: number | null;
  igloo_advance_received_at: string | null;
  notes: string | null;
};

type Sale = {
  id: string;
  sale_date: string | null;
  shipment_id: string | null;
  buyer_name: string;
  buyer_country: string | null;
  product: string | null;
  weight_lb: number;
  price_per_lb_usd: number;
  gross_usd: number;
  igloo_commission_pct: number | null;
  igloo_commission_usd: number | null;
  igloo_processing_fee_usd: number | null;
  igloo_storage_alloc_usd: number | null;
  net_to_bsc_usd: number | null;
  notes: string | null;
};

type Lot = {
  id: string;
  lot_number: string | null;
  product_type: string | null;
  finished_weight_lb: number | null;
  cost_paid: number | null;
  processed_at: string | null;
};

type Tab = 'ship' | 'sell' | 'pnl';

export default function IglooPage() {
  const [tab, setTab] = useState<Tab>('ship');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Shipment form state
  const [sDate, setSDate] = useState(new Date().toISOString().slice(0, 10));
  const [sForwarder, setSForwarder] = useState('Ship X');
  const [sFreightCost, setSFreightCost] = useState('');
  const [sCoolers, setSCoolers] = useState('');
  const [sWeight, setSWeight] = useState('');
  const [sCostBasis, setSCostBasis] = useState('');
  const [sAdvance, setSAdvance] = useState('');
  const [sNotes, setSNotes] = useState('');
  const [sLotIds, setSLotIds] = useState<string[]>([]);
  const [shipBusy, setShipBusy] = useState(false);

  // Sale form state
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [saleShipmentId, setSaleShipmentId] = useState('');
  const [saleBuyer, setSaleBuyer] = useState('Jomara Seafood');
  const [saleCountry, setSaleCountry] = useState('USA');
  const [saleProduct, setSaleProduct] = useState('Lobster Tail #1 6oz');
  const [saleWeight, setSaleWeight] = useState('');
  const [salePrice, setSalePrice] = useState('17.00');
  const [saleCommissionPct, setSaleCommissionPct] = useState('10');
  const [saleProcessingPerLb, setSaleProcessingPerLb] = useState('1.75');
  const [saleStorageAlloc, setSaleStorageAlloc] = useState('0');
  const [saleNotes, setSaleNotes] = useState('');
  const [saleBusy, setSaleBusy] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    const [s, sa, l] = await Promise.all([
      supabase.from('igloo_shipments').select('*').order('shipment_date', { ascending: false }).limit(100),
      supabase.from('igloo_sales').select('*').order('sale_date', { ascending: false }).limit(200),
      supabase
        .from('yield_lots')
        .select('id, lot_number, product_type, finished_weight_lb, cost_paid, processed_at')
        .not('processed_at', 'is', null)
        .order('processed_at', { ascending: false })
        .limit(100),
    ]);
    if (s.error) setError(plainError(s.error));
    setShipments((s.data || []) as Shipment[]);
    setSales((sa.data || []) as Sale[]);
    setLots((l.data || []) as Lot[]);
    setLoading(false);
  }

  function shipGross() {
    const g = Number(salePrice) * Number(saleWeight);
    return Number.isFinite(g) ? g : 0;
  }
  function saleNet() {
    const gross = shipGross();
    const comm = gross * (Number(saleCommissionPct) / 100 || 0);
    const proc = Number(saleProcessingPerLb || 0) * Number(saleWeight || 0);
    const stor = Number(saleStorageAlloc || 0);
    return Math.max(0, gross - comm - proc - stor);
  }

  async function submitShipment(e: React.FormEvent) {
    e.preventDefault();
    if (!sWeight || Number(sWeight) <= 0) { alert('Enter total weight (lbs)'); return; }
    setShipBusy(true);
    setError(null);

    const row = {
      shipment_date: sDate,
      freight_forwarder: sForwarder,
      freight_cost_usd: sFreightCost ? Number(sFreightCost) : null,
      cooler_count: sCoolers ? Number(sCoolers) : null,
      total_weight_lb: Number(sWeight),
      total_cost_basis_bsd: sCostBasis ? Number(sCostBasis) : null,
      igloo_advance_amount_usd: sAdvance ? Number(sAdvance) : null,
      igloo_advance_received_at: sAdvance ? new Date().toISOString() : null,
      notes: sNotes.trim() || null,
      status: 'in_transit' as const,
    };

    const { data: inserted, error: ierr } = await supabase
      .from('igloo_shipments')
      .insert(row)
      .select('id')
      .single();
    if (ierr || !inserted) {
      setError(ierr?.message || 'Save failed');
      setShipBusy(false);
      return;
    }

    // Insert lot links if any selected (best effort - may fail silently
    // if user picked lots that need explicit weight per lot; we just
    // share the total weight evenly for v1)
    if (sLotIds.length > 0) {
      const perLot = Number(sWeight) / sLotIds.length;
      const links = sLotIds.map((id) => ({
        shipment_id: inserted.id,
        yield_lot_id: id,
        weight_lb_shipped: perLot,
      }));
      await supabase.from('igloo_shipment_lots').insert(links);
    }

    setSuccess(`✓ Shipment logged · ${sWeight} lbs to Igloo Miami`);
    setSWeight('');
    setSCostBasis('');
    setSAdvance('');
    setSNotes('');
    setSLotIds([]);
    setShipBusy(false);
    setTimeout(() => setSuccess(null), 3000);
    load();
  }

  async function submitSale(e: React.FormEvent) {
    e.preventDefault();
    if (!saleBuyer.trim() || !saleWeight || !salePrice) { alert('Fill buyer, weight, price'); return; }
    setSaleBusy(true);
    setError(null);

    const gross = shipGross();
    const comm = gross * (Number(saleCommissionPct) / 100 || 0);
    const proc = Number(saleProcessingPerLb || 0) * Number(saleWeight || 0);
    const stor = Number(saleStorageAlloc || 0);
    const net = Math.max(0, gross - comm - proc - stor);

    const row = {
      sale_date: saleDate,
      shipment_id: saleShipmentId || null,
      buyer_name: saleBuyer.trim(),
      buyer_country: saleCountry || 'USA',
      product: saleProduct.trim() || null,
      weight_lb: Number(saleWeight),
      price_per_lb_usd: Number(salePrice),
      gross_usd: Math.round(gross * 100) / 100,
      igloo_commission_pct: Number(saleCommissionPct) || null,
      igloo_commission_usd: Math.round(comm * 100) / 100,
      igloo_processing_fee_usd: Math.round(proc * 100) / 100,
      igloo_storage_alloc_usd: Math.round(stor * 100) / 100,
      net_to_bsc_usd: Math.round(net * 100) / 100,
      notes: saleNotes.trim() || null,
    };

    const { error: ierr } = await supabase.from('igloo_sales').insert(row);
    if (ierr) {
      setError(plainError(ierr));
      setSaleBusy(false);
      return;
    }

    setSuccess(`✓ Sale logged · ${saleWeight} lbs · gross $${gross.toFixed(2)} · net to BSC $${net.toFixed(2)}`);
    setSaleWeight('');
    setSaleNotes('');
    setSaleBusy(false);
    setTimeout(() => setSuccess(null), 3000);
    load();
  }

  const totals = useMemo(() => {
    const shippedLbs = shipments.reduce((s, x) => s + Number(x.total_weight_lb || 0), 0);
    const soldLbs = sales.reduce((s, x) => s + Number(x.weight_lb || 0), 0);
    const inventoryLbs = Math.max(0, shippedLbs - soldLbs);
    const grossUsd = sales.reduce((s, x) => s + Number(x.gross_usd || 0), 0);
    const netUsd = sales.reduce((s, x) => s + Number(x.net_to_bsc_usd || 0), 0);
    return {
      shippedLbs: Math.round(shippedLbs * 10) / 10,
      soldLbs: Math.round(soldLbs * 10) / 10,
      inventoryLbs: Math.round(inventoryLbs * 10) / 10,
      grossUsd: Math.round(grossUsd * 100) / 100,
      netUsd: Math.round(netUsd * 100) / 100,
    };
  }, [shipments, sales]);

  // Per-shipment P&L
  const pnl = useMemo(() => {
    return shipments.map((sh) => {
      const linked = sales.filter((x) => x.shipment_id === sh.id);
      const soldLbs = linked.reduce((s, x) => s + Number(x.weight_lb || 0), 0);
      const grossUsd = linked.reduce((s, x) => s + Number(x.gross_usd || 0), 0);
      const netUsd = linked.reduce((s, x) => s + Number(x.net_to_bsc_usd || 0), 0);
      const costBasisBsd = Number(sh.total_cost_basis_bsd || 0);
      const profit = netUsd - costBasisBsd; // BSD ≈ USD at par
      const remainingLbs = Math.max(0, Number(sh.total_weight_lb || 0) - soldLbs);
      return { shipment: sh, soldLbs, grossUsd, netUsd, costBasisBsd, profit, remainingLbs };
    });
  }, [shipments, sales]);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>

      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0, marginBottom: 6 }}>
        Igloo Integration
      </h1>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>
        BSC ↔ Igloo Express (Miami): shipments out, sales executed, per-shipment P&L. Net Igloo deductions: $1.75/lb processing + commission + storage.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 14 }}>
        <Stat label="Shipped" value={`${totals.shippedLbs} lb`} accent="#1a6fb5" />
        <Stat label="Sold" value={`${totals.soldLbs} lb`} accent="#22c55e" />
        <Stat label="At Igloo" value={`${totals.inventoryLbs} lb`} accent="#a78bfa" />
        <Stat label="Gross USD" value={`$${totals.grossUsd.toFixed(0)}`} accent="#fb923c" />
        <Stat label="Net USD" value={`$${totals.netUsd.toFixed(0)}`} accent="#22c55e" />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <TabBtn active={tab === 'ship'} onClick={() => setTab('ship')}>Shipments out</TabBtn>
        <TabBtn active={tab === 'sell'} onClick={() => setTab('sell')}>Sales</TabBtn>
        <TabBtn active={tab === 'pnl'} onClick={() => setTab('pnl')}>Shipment P&L</TabBtn>
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, marginBottom: 12 }}>
          ⚠️ {error}
          {(error.toLowerCase().includes('relation') || error.toLowerCase().includes('column')) && (
            <div style={{ marginTop: 6 }}>Run sql/2026-05-09-igloo-integration.sql in Supabase.</div>
          )}
        </div>
      )}

      {success && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: 10, padding: 12, color: '#22c55e', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          {success}
        </div>
      )}

      {tab === 'ship' && (
        <>
          <form onSubmit={submitShipment} style={cardStyle}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#f5c518', marginBottom: 8 }}>+ Log shipment to Igloo</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Field label="Date">
                <input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} style={inputStyle} required />
              </Field>
              <Field label="Freight forwarder">
                <select value={sForwarder} onChange={(e) => setSForwarder(e.target.value)} style={inputStyle}>
                  {FREIGHT_FORWARDERS.map((f) => <option key={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Coolers">
                <input type="number" min="0" value={sCoolers} onChange={(e) => setSCoolers(e.target.value)} style={inputStyle} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Field label="Total weight (lb)">
                <input type="number" step="0.01" min="0" value={sWeight} onChange={(e) => setSWeight(e.target.value)} style={inputStyle} required />
              </Field>
              <Field label="Freight cost (USD)">
                <input type="number" step="0.01" min="0" value={sFreightCost} onChange={(e) => setSFreightCost(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Cost basis (BSD)">
                <input type="number" step="0.01" min="0" value={sCostBasis} onChange={(e) => setSCostBasis(e.target.value)} style={inputStyle} />
              </Field>
            </div>

            <Field label="Igloo advance (USD, if paid at door)">
              <input type="number" step="0.01" min="0" value={sAdvance} onChange={(e) => setSAdvance(e.target.value)} placeholder="optional - working capital advance" style={inputStyle} />
            </Field>

            <Field label={`Source lots (${lots.length} measured available, click to attach)`}>
              <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 6, padding: 8, maxHeight: 120, overflow: 'auto' }}>
                {lots.length === 0 && (
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>No measured lots. Process via /yield-measure.</div>
                )}
                {lots.map((l) => {
                  const checked = sLotIds.includes(l.id);
                  return (
                    <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 11, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) setSLotIds((ids) => [...ids, l.id]);
                          else setSLotIds((ids) => ids.filter((x) => x !== l.id));
                        }}
                      />
                      <span style={{ fontFamily: 'monospace', color: '#f5c518' }}>{l.lot_number || l.id.slice(0, 8)}</span>
                      {l.product_type} · {Number(l.finished_weight_lb || 0).toFixed(1)} lb
                    </label>
                  );
                })}
              </div>
            </Field>

            <Field label="Notes">
              <input value={sNotes} onChange={(e) => setSNotes(e.target.value)} style={inputStyle} />
            </Field>

            <button type="submit" disabled={shipBusy} style={{ width: '100%', background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '12px 14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', opacity: shipBusy ? 0.5 : 1 }}>
              {shipBusy ? 'Saving…' : 'Log shipment'}
            </button>
          </form>

          <div style={{ fontSize: 12, fontWeight: 800, color: '#f5c518', marginTop: 14, marginBottom: 6 }}>
            Recent shipments
          </div>
          {loading && <div style={{ color: '#94a3b8', padding: 12 }}>Loading…</div>}
          {!loading && shipments.length === 0 && (
            <div style={{ color: '#94a3b8', padding: 12, textAlign: 'center', fontSize: 12 }}>
              No shipments yet.
            </div>
          )}
          {shipments.map((sh) => (
            <div key={sh.id} style={{ ...cardStyle, borderLeft: `4px solid ${sh.status === 'in_transit' ? '#f5c518' : sh.status === 'sold_out' ? '#22c55e' : '#a78bfa'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
                    {sh.shipment_date} · {Number(sh.total_weight_lb).toFixed(1)} lb
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                    {sh.freight_forwarder || '—'}
                    {sh.cooler_count && ` · ${sh.cooler_count} coolers`}
                    {sh.freight_cost_usd && ` · freight $${Number(sh.freight_cost_usd).toFixed(2)}`}
                    {sh.igloo_advance_amount_usd && ` · advance $${Number(sh.igloo_advance_amount_usd).toFixed(2)}`}
                  </div>
                  {sh.notes && <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 4, fontStyle: 'italic' }}>{sh.notes}</div>}
                </div>
                <span style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800, padding: '4px 8px', borderRadius: 999, color: '#060d1f', background: sh.status === 'in_transit' ? '#f5c518' : sh.status === 'sold_out' ? '#22c55e' : '#a78bfa' }}>
                  {sh.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'sell' && (
        <>
          <form onSubmit={submitSale} style={cardStyle}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#f5c518', marginBottom: 8 }}>+ Log Igloo sale</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Sale date">
                <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} style={inputStyle} required />
              </Field>
              <Field label="From shipment (optional)">
                <select value={saleShipmentId} onChange={(e) => setSaleShipmentId(e.target.value)} style={inputStyle}>
                  <option value="">— unattached —</option>
                  {shipments.map((sh) => (
                    <option key={sh.id} value={sh.id}>
                      {sh.shipment_date} · {Number(sh.total_weight_lb).toFixed(0)} lb
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Buyer">
                <input value={saleBuyer} onChange={(e) => setSaleBuyer(e.target.value)} style={inputStyle} required />
              </Field>
              <Field label="Country">
                <input value={saleCountry} onChange={(e) => setSaleCountry(e.target.value)} style={inputStyle} />
              </Field>
            </div>

            <Field label="Product">
              <input value={saleProduct} onChange={(e) => setSaleProduct(e.target.value)} placeholder="Lobster Tail #1 6oz" style={inputStyle} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Field label="Weight (lb)">
                <input type="number" step="0.01" min="0" value={saleWeight} onChange={(e) => setSaleWeight(e.target.value)} style={inputStyle} required />
              </Field>
              <Field label="Price/lb USD">
                <input type="number" step="0.01" min="0" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} style={inputStyle} required />
              </Field>
              <Field label="Gross USD (auto)">
                <input type="text" value={`$${shipGross().toFixed(2)}`} readOnly style={{ ...inputStyle, background: '#0a1628', color: '#fb923c', fontWeight: 800 }} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Field label="Igloo commission %">
                <input type="number" step="0.1" min="0" value={saleCommissionPct} onChange={(e) => setSaleCommissionPct(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Processing $/lb">
                <input type="number" step="0.01" min="0" value={saleProcessingPerLb} onChange={(e) => setSaleProcessingPerLb(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Storage alloc USD">
                <input type="number" step="0.01" min="0" value={saleStorageAlloc} onChange={(e) => setSaleStorageAlloc(e.target.value)} style={inputStyle} />
              </Field>
            </div>

            {saleWeight && salePrice && (
              <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 6, padding: 8, marginBottom: 10, fontSize: 12 }}>
                <div style={{ color: '#cbd5e1' }}>
                  Gross: <b>${shipGross().toFixed(2)}</b>
                  {' · '}
                  −Commission: ${(shipGross() * Number(saleCommissionPct) / 100).toFixed(2)}
                  {' · '}
                  −Processing: ${(Number(saleProcessingPerLb) * Number(saleWeight)).toFixed(2)}
                  {' · '}
                  −Storage: ${Number(saleStorageAlloc).toFixed(2)}
                </div>
                <div style={{ color: '#22c55e', fontWeight: 800, marginTop: 4 }}>
                  Net to BSC: ${saleNet().toFixed(2)}
                </div>
              </div>
            )}

            <Field label="Notes">
              <input value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)} style={inputStyle} />
            </Field>

            <button type="submit" disabled={saleBusy} style={{ width: '100%', background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '12px 14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', opacity: saleBusy ? 0.5 : 1 }}>
              {saleBusy ? 'Saving…' : 'Log sale'}
            </button>
          </form>

          <div style={{ fontSize: 12, fontWeight: 800, color: '#f5c518', marginTop: 14, marginBottom: 6 }}>
            Recent sales
          </div>
          {!loading && sales.length === 0 && (
            <div style={{ color: '#94a3b8', padding: 12, textAlign: 'center', fontSize: 12 }}>
              No sales logged yet.
            </div>
          )}
          {sales.map((sa) => (
            <div key={sa.id} style={{ ...cardStyle, borderLeft: '4px solid #22c55e' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
                    {sa.product || '—'} · {Number(sa.weight_lb).toFixed(1)} lb @ ${Number(sa.price_per_lb_usd).toFixed(2)}/lb
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                    {sa.sale_date} · {sa.buyer_name} ({sa.buyer_country || 'USA'})
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#22c55e' }}>${Number(sa.net_to_bsc_usd || 0).toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>net of ${Number(sa.gross_usd || 0).toFixed(2)} gross</div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'pnl' && (
        <>
          {pnl.length === 0 && (
            <div style={{ color: '#94a3b8', padding: 12, textAlign: 'center', fontSize: 12 }}>
              No shipments yet to compute P&L.
            </div>
          )}
          {pnl.map(({ shipment, soldLbs, grossUsd, netUsd, costBasisBsd, profit, remainingLbs }) => {
            const profitTone = profit >= 0 ? '#22c55e' : '#f87171';
            return (
              <div key={shipment.id} style={{ ...cardStyle, borderLeft: `4px solid ${profitTone}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                      Shipment {shipment.shipment_date} · {Number(shipment.total_weight_lb).toFixed(1)} lb
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      Sold {soldLbs.toFixed(1)} lb · {remainingLbs.toFixed(1)} remaining at Igloo
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: profitTone }}>
                    {profit >= 0 ? '+' : '−'}${Math.abs(profit).toFixed(2)}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px dashed #1e3a5f', fontSize: 11 }}>
                  <PnlBlock label="Cost (BSD)" value={`$${costBasisBsd.toFixed(0)}`} />
                  <PnlBlock label="Gross (USD)" value={`$${grossUsd.toFixed(0)}`} />
                  <PnlBlock label="Net to BSC" value={`$${netUsd.toFixed(0)}`} />
                  <PnlBlock label="Profit" value={`${profit >= 0 ? '+' : '−'}$${Math.abs(profit).toFixed(0)}`} accent={profitTone} />
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 900, color: accent || '#f5c518', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function PnlBlock({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: accent || '#fff', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function TabBtn({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#f5c518' : '#0d1f3c',
        color: active ? '#060d1f' : '#cbd5e1',
        border: active ? 'none' : '1px solid #1e3a5f',
        borderRadius: 8,
        padding: '8px 14px',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 760, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '12px 14px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
