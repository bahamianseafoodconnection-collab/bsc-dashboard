'use client';

// /spinytails/labels — unified label printing (Rollo X1040)
//
// Pick a batch + label type (Receiving / Tray / Rack / Master Carton / Export)
// + copies → print. The permanent batch number prints as text + QR + barcode on
// every type, unchanged. Carton/Export labels pull the CCP-2 regulatory
// declarations (scientific name, allergen, sulfite, FAO area, origin) from the
// species config. Reuses lib/label-print (qrcode + JsBarcode).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { printLabels, type LabelData } from '@/lib/label-print';

export const dynamic = 'force-dynamic';

interface Lot { id: string; batch_number: string | null; lot_code: string; species_code: string | null; receipt_date: string; vessel_id: string | null; }
interface Species { code: string; name: string; scientific_name: string | null; ccp_limits: Record<string, unknown>; }

type LabelType = 'receiving' | 'tray' | 'rack' | 'carton' | 'export';
const TYPES: { key: LabelType; name: string; title: string }[] = [
  { key: 'receiving', name: 'Receiving', title: 'RECEIVING' },
  { key: 'tray', name: 'Tray', title: 'TRAY' },
  { key: 'rack', name: 'Blast Freezer Rack', title: 'BLAST FREEZER RACK' },
  { key: 'carton', name: 'Master Carton', title: 'MASTER CARTON' },
  { key: 'export', name: 'Export Carton', title: 'EXPORT CARTON' },
];

export default function LabelsPage() {
  const [auth, setAuth] = useState<'checking'|'no'|'forbidden'|'ok'>('checking');
  const [lots, setLots] = useState<Lot[]>([]);
  const [species, setSpecies] = useState<Record<string, Species>>({});
  const [lotId, setLotId] = useState('');
  const [type, setType] = useState<LabelType>('tray');
  const [copies, setCopies] = useState('1');
  const [netWeight, setNetWeight] = useState('');
  const [detail, setDetail] = useState<{ product: string; weight: string; tray: string; rack: string; freezer: string; supplier: string; date: string } | null>(null);

  const lot = lots.find((l) => l.id === lotId);
  const sp = lot?.species_code ? species[lot.species_code] : undefined;
  const batch = lot?.batch_number ?? lot?.lot_code ?? '';

  useEffect(() => { (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAuth('no'); return; }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    const role = (prof as { role?: string | null } | null)?.role ?? null;
    if (!role || !['founder','co_founder','control_admin','basic_admin','manager','processor','receiver','qc_staff'].includes(role)) { setAuth('forbidden'); return; }
    setAuth('ok');
    const [{ data: ls }, { data: sps }] = await Promise.all([
      supabase.from('spinytails_lots').select('id, batch_number, lot_code, species_code, receipt_date, vessel_id').order('receipt_date', { ascending: false }).limit(200),
      supabase.from('spinytails_species').select('code, name, scientific_name, ccp_limits'),
    ]);
    setLots((ls ?? []) as Lot[]);
    const m: Record<string, Species> = {}; for (const s of (sps ?? []) as Species[]) m[s.code] = s; setSpecies(m);
  })(); }, []);

  async function selectLot(id: string) {
    setLotId(id);
    const l = lots.find((x) => x.id === id); if (!l) { setDetail(null); return; }
    const [{ data: pb }, { data: intake }, { data: vessel }] = await Promise.all([
      supabase.from('spinytails_processing_batches').select('finished_product_name, finished_weight_lbs, tray_number, rack_number, blast_freezer_location').eq('lot_id', id).order('ended_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('spinytails_lot_intakes').select('product_name, quantity_lbs').eq('lot_id', id).limit(1).maybeSingle(),
      l.vessel_id ? supabase.from('spinytails_vessels').select('fisherman_name').eq('id', l.vessel_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const p = pb as { finished_product_name?: string; finished_weight_lbs?: number; tray_number?: string; rack_number?: string; blast_freezer_location?: string } | null;
    const it = intake as { product_name?: string; quantity_lbs?: number } | null;
    setDetail({
      product: p?.finished_product_name ?? it?.product_name ?? species[l.species_code ?? '']?.name ?? '',
      weight: p?.finished_weight_lbs ? `${p.finished_weight_lbs} lb` : (it?.quantity_lbs ? `${it.quantity_lbs} lb` : ''),
      tray: p?.tray_number ?? '', rack: p?.rack_number ?? '', freezer: p?.blast_freezer_location ?? '',
      supplier: (vessel as { fisherman_name?: string } | null)?.fisherman_name ?? '',
      date: l.receipt_date,
    });
    setNetWeight('');
  }

  function build(): LabelData {
    const d = detail!;
    const t = TYPES.find((x) => x.key === type)!;
    const weight = netWeight ? `${netWeight} lb` : d.weight;
    const lim = (sp?.ccp_limits ?? {}) as Record<string, string>;
    const declarations = (type === 'carton' || type === 'export') ? [
      sp?.scientific_name ? { label: 'Scientific Name', value: sp.scientific_name } : null,
      lim.fao_area ? { label: 'FAO Zone', value: String(lim.fao_area) } : null,
      lim.origin ? { label: 'Origin', value: String(lim.origin) } : null,
      lim.harvest ? { label: 'Harvest', value: String(lim.harvest) } : null,
      lim.allergen ? { label: 'Allergen', value: String(lim.allergen) } : null,
      lim.sulfite_statement ? { label: 'Sulfite', value: String(lim.sulfite_statement) } : null,
      { label: 'Establishment', value: 'Spiny Tails Processing Co.' },
    ].filter(Boolean) as Array<{ label: string; value: string }> : [];

    const base: LabelData = { title: t.title, product_name: d.product, batch_number: batch, weight, date: new Date(d.date).toLocaleDateString('en-US') };
    if (type === 'receiving') return { ...base, supplier: d.supplier };
    if (type === 'tray')      return { ...base, tray_number: d.tray, rack_number: d.rack, extra: d.freezer ? [{ label: 'Blast Freezer', value: d.freezer }] : [] };
    if (type === 'rack')      return { ...base, rack_number: d.rack, extra: [d.freezer ? { label: 'Blast Freezer', value: d.freezer } : { label: 'Storage', value: 'Blast Freezer' }] };
    // carton / export
    return { ...base, extra: declarations };
  }

  function print() {
    if (!detail || !batch) return;
    printLabels([build()], { widthIn: 4, heightIn: 6, copies: Math.max(1, parseInt(copies, 10) || 1) });
  }

  if (auth === 'checking') return <C>Checking…</C>;
  if (auth === 'no') return <C>Sign in required. <Link href="/staff-login?next=/spinytails/labels" style={{ color: '#1a2e5a', textDecoration: 'underline' }}>Sign in →</Link></C>;
  if (auth === 'forbidden') return <C>Processing / QC / admin only.</C>;

  const inp: React.CSSProperties = { width: '100%', padding: 13, fontSize: 16, border: '2px solid #cbd5e1', borderRadius: 10, marginTop: 6 };
  const sec: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 14 };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: 16, fontFamily: 'system-ui', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0b1628', margin: 0 }}>🏷 Label Printing</h1>
        <Link href="/spinytails" style={{ fontSize: 12, color: '#64748b' }}>← Spiny Tail</Link>
      </div>

      <div style={sec}>
        <div style={lbl}>Batch</div>
        <select value={lotId} onChange={(e) => selectLot(e.target.value)} style={inp}>
          <option value="">— select batch —</option>
          {lots.map((l) => <option key={l.id} value={l.id}>{l.batch_number ?? l.lot_code} · {l.species_code}</option>)}
        </select>

        <div style={{ ...lbl, marginTop: 14 }}>Label type</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {TYPES.map((t) => <button key={t.key} onClick={() => setType(t.key)} style={{ padding: '10px 14px', borderRadius: 10, fontWeight: 800, fontSize: 13, border: '2px solid', borderColor: type === t.key ? '#0b1628' : '#cbd5e1', background: type === t.key ? '#0b1628' : '#fff', color: type === t.key ? '#fff' : '#0b1628' }}>{t.name}</button>)}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <div><div style={lbl}>Net weight override</div><input placeholder="(uses finished wt)" value={netWeight} onChange={(e) => setNetWeight(e.target.value)} style={inp} /></div>
          <div><div style={lbl}>Copies</div><input type="number" inputMode="numeric" value={copies} onChange={(e) => setCopies(e.target.value)} style={inp} /></div>
        </div>
      </div>

      {detail && (
        <div style={sec}>
          <div style={lbl}>Preview</div>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, marginTop: 6 }}>
            <b>{TYPES.find((t) => t.key === type)?.title}</b> · {detail.product || '—'}<br/>
            <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>{batch}</span> · {(netWeight ? `${netWeight} lb` : detail.weight) || '—'}
            {(type === 'tray' || type === 'rack') && <> · tray {detail.tray || '—'} rack {detail.rack || '—'}</>}
            {(type === 'carton' || type === 'export') && sp && <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>+ {sp.scientific_name} · {(sp.ccp_limits as Record<string,string>).allergen ?? ''} · {(sp.ccp_limits as Record<string,string>).sulfite_statement ?? ''}</div>}
          </div>
        </div>
      )}

      <button onClick={print} disabled={!detail} style={{ width: '100%', padding: 18, fontSize: 18, fontWeight: 900, background: detail ? '#f5c518' : '#cbd5e1', color: '#0b1628', border: 'none', borderRadius: 14, cursor: detail ? 'pointer' : 'not-allowed' }}>
        🖨 Print {copies}× {TYPES.find((t) => t.key === type)?.name} label{Number(copies) === 1 ? '' : 's'} (Rollo)
      </button>
    </div>
  );
}

function C({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>{children}</div>;
}
