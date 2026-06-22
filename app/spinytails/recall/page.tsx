'use client';

// /spinytails/recall — Recall & traceability search
//
// Enter a batch number → the complete harvest→customer chain in one view
// (fisherman/vessel, receiving + QC, freezer removals, processing + steps,
// sales/customers, export shipments). One-tap "Mark recalled" places an
// instant hold on the whole lot.

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface Trace {
  batch_number: string;
  lot: { species_code: string | null; status: string; receipt_date: string; lot_code: string };
  fisherman: { vessel_code: string | null; vessel_name: string | null; fisherman_name: string | null; fisherman_phone: string | null; license_number: string | null } | null;
  receiving: Record<string, unknown> | null;
  freezer_removals: Array<Record<string, unknown>>;
  processing: Array<Record<string, unknown>>;
  steps: Array<{ step_no: number; step_name: string; recorded_at: string }>;
  sales: Array<{ quantity_lbs: number | null; order: { order_type?: string; customer_name?: string; customer_phone?: string } | null; product: { name?: string; sku?: string } | null }>;
  shipments: Array<{ master_cartons: number | null; weight_lbs: number | null; shipment: { shipment_number?: string; destination_customer?: string; destination_country?: string; coi_number?: string } | null }>;
}

export default function RecallSearchPage() {
  const [q, setQ] = useState('');
  const [t, setT] = useState<Trace | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function search(batch?: string) {
    const b = (batch ?? q).trim();
    if (!b) return;
    setBusy(true); setErr(''); setT(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/spinytails/recall/${encodeURIComponent(b)}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setT(j as Trace);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Search failed'); }
    finally { setBusy(false); }
  }

  async function markRecalled() {
    if (!t) return;
    const reason = window.prompt('Recall reason?', '');
    if (reason === null) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/spinytails/recall/${encodeURIComponent(t.batch_number)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ reason }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await search(t.batch_number);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Recall failed'); }
    finally { setBusy(false); }
  }

  const sec: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 12 };
  const h: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 };
  const recalled = t?.lot.status === 'recalled';

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: 16, fontFamily: 'system-ui', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0b1628', margin: 0 }}>🔎 Recall & Traceability</h1>
        <Link href="/spinytails" style={{ fontSize: 12, color: '#64748b' }}>← Spiny Tail</Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Batch number — e.g. CON-20260622-001"
          style={{ flex: 1, padding: 14, fontSize: 16, fontFamily: 'monospace', border: '2px solid #cbd5e1', borderRadius: 10 }} />
        <button onClick={() => search()} disabled={busy} style={{ padding: '0 22px', background: '#0b1628', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>{busy ? '…' : 'Search'}</button>
      </div>

      {err && <div style={{ ...sec, border: '2px solid #dc2626', background: '#fef2f2', color: '#b91c1c', fontWeight: 700 }}>⚠ {err}</div>}

      {t && <>
        <div style={{ ...sec, border: `2px solid ${recalled ? '#dc2626' : '#0b1628'}`, background: recalled ? '#fef2f2' : '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, fontFamily: 'monospace', color: '#0b1628' }}>{t.batch_number}</div>
              <div style={{ fontSize: 13, color: '#475569' }}>{t.lot.species_code} · received {t.lot.receipt_date} · status <b style={{ color: recalled ? '#dc2626' : '#16a34a' }}>{t.lot.status.toUpperCase()}</b></div>
            </div>
            {!recalled && <button onClick={markRecalled} disabled={busy} style={{ padding: '12px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 900, cursor: 'pointer' }}>⛔ Mark RECALLED</button>}
            {recalled && <span style={{ fontWeight: 900, color: '#dc2626' }}>⛔ RECALLED</span>}
          </div>
        </div>

        <div style={sec}>
          <div style={h}>Fisherman / Vessel</div>
          {t.fisherman ? <div style={{ fontSize: 14 }}><b>{t.fisherman.fisherman_name}</b> · {t.fisherman.vessel_name ?? t.fisherman.vessel_code} {t.fisherman.license_number ? `· Lic ${t.fisherman.license_number}` : ''} {t.fisherman.fisherman_phone ? `· 📞 ${t.fisherman.fisherman_phone}` : ''}</div> : <Empty />}
        </div>

        <div style={sec}>
          <div style={h}>Receiving</div>
          {t.receiving ? <div style={{ fontSize: 14, lineHeight: 1.7 }}>
            Product: <b>{String(t.receiving.product_name ?? '—')}</b> · {String(t.receiving.quantity_lbs ?? '—')} lb · {String(t.receiving.product_state ?? '')} · temp {String(t.receiving.core_temp_f_at_receipt ?? '—')}°F · grade {String(t.receiving.product_grade ?? '—')}<br/>
            Harvest: {String(t.receiving.fishing_area ?? '—')} · {String(t.receiving.fishing_date_start ?? '')}–{String(t.receiving.fishing_date_end ?? '')} · CCP-1 {t.receiving.qc_pass ? '✓ pass' : '⚠ check'}
            {Array.isArray(t.receiving.harvest_photos) && (t.receiving.harvest_photos as unknown[]).length > 0 && <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>{(t.receiving.harvest_photos as Array<{ url: string }>).map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p.url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
            ))}</div>}
          </div> : <Empty />}
        </div>

        <div style={sec}>
          <div style={h}>Freezer removals</div>
          {t.freezer_removals.length ? t.freezer_removals.map((r, i) => <div key={i} style={{ fontSize: 13, borderBottom: '1px dotted #ddd', padding: '4px 0' }}>{String(r.weight_removed_lbs)} lb · {String(r.purpose)} · tray {String(r.tray_number ?? '—')} rack {String(r.rack_number ?? '—')} {r.blast_freezer_location ? `· ${r.blast_freezer_location}` : ''}</div>) : <Empty />}
        </div>

        <div style={sec}>
          <div style={h}>Processing</div>
          {t.processing.length ? t.processing.map((p, i) => <div key={i} style={{ fontSize: 13, lineHeight: 1.6 }}>
            {String(p.finished_product_name ?? '—')} · in {String(p.lbs_in ?? '—')} → out {String(p.finished_weight_lbs ?? p.lbs_graded ?? '—')} lb · yield <b>{String(p.yield_pct ?? '—')}%</b> · loss {String(p.processing_loss_lbs ?? '—')} lb · {String(p.packages_produced ?? '—')} pkgs · tray {String(p.tray_number ?? '—')} rack {String(p.rack_number ?? '—')}
          </div>) : <Empty />}
          {t.steps.length > 0 && <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>Steps: {t.steps.map((s) => `${s.step_no}.${s.step_name}`).join(' → ')}</div>}
        </div>

        <div style={sec}>
          <div style={h}>Sales / customers</div>
          {t.sales.length ? t.sales.map((s, i) => <div key={i} style={{ fontSize: 13, borderBottom: '1px dotted #ddd', padding: '4px 0' }}>{s.quantity_lbs ?? '—'} lb · {s.product?.name ?? s.product?.sku ?? '—'} → <b>{s.order?.customer_name ?? 'walk-in'}</b> {s.order?.customer_phone ? `· ${s.order.customer_phone}` : ''} ({s.order?.order_type ?? '—'})</div>) : <Empty />}
        </div>

        <div style={sec}>
          <div style={h}>Export shipments</div>
          {t.shipments.length ? t.shipments.map((s, i) => <div key={i} style={{ fontSize: 13, borderBottom: '1px dotted #ddd', padding: '4px 0' }}>{s.shipment?.shipment_number ?? '—'} · {s.master_cartons ?? '—'} cartons · {s.shipment?.destination_customer ?? '—'}, {s.shipment?.destination_country ?? '—'} {s.shipment?.coi_number ? `· COI ${s.shipment.coi_number}` : ''}</div>) : <Empty />}
        </div>
      </>}
    </div>
  );
}

function Empty() { return <div style={{ fontSize: 13, color: '#94a3b8' }}>— none recorded —</div>; }
