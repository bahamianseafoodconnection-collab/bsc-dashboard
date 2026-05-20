'use client';

// /spinytails/lots/[lot_code]/stickers
//
// Printable Avery 5163 trace-QR sticker sheet — 2"×4" labels, 10 per
// US-Letter page (2 cols × 5 rows). Each sticker carries the QR for
// https://bscbahamas.com/trace/<lot_code> plus the lot code, vessel,
// receipt date, and BSC brand line so anyone receiving the carton can
// scan and verify provenance.
//
// Default 10 stickers (one sheet); founder can bump to 20 / 30 / 50 /
// custom for big shipments. Chooses ceil(N/10) sheets and pads the last
// sheet with blank cells so leftover labels stay re-feedable.
//
// Print CSS uses @page size: letter so Chrome / Safari print at the
// physical Avery dimensions without scaling. No PDF dep — the browser's
// "Save as PDF" handles export.

import { use as usePromise, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver']);

interface Lot {
  id:           string;
  lot_code:     string;
  receipt_date: string;
  status:       string;
  vessel_id:    string;
}
interface Vessel {
  id:             string;
  vessel_code:    string;
  vessel_name:    string | null;
  fisherman_name: string;
}

const COUNT_PRESETS = [10, 20, 30, 50] as const;
const TRACE_BASE    = 'https://bscbahamas.com/trace';
const LABELS_PER_SHEET = 10;

export default function StickersPage({ params }: { params: Promise<{ lot_code: string }> }) {
  const { lot_code } = usePromise(params);
  const [authed,   setAuthed]   = useState<boolean | null>(null);
  const [lot,      setLot]      = useState<Lot | null>(null);
  const [vessel,   setVessel]   = useState<Vessel | null>(null);
  const [err,      setErr]      = useState<string | null>(null);
  const [count,    setCount]    = useState<number>(LABELS_PER_SHEET);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = `/staff-login?next=/spinytails/lots/${encodeURIComponent(lot_code)}/stickers`; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !STAFF_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
    })();
  }, [lot_code]);

  useEffect(() => {
    if (!authed) return;
    (async () => {
      const { data: lotRow, error: lotErr } = await supabase
        .from('spinytails_lots')
        .select('id, lot_code, receipt_date, status, vessel_id')
        .eq('lot_code', lot_code)
        .maybeSingle();
      if (lotErr || !lotRow) { setErr(lotErr?.message ?? 'Lot not found'); return; }
      setLot(lotRow as Lot);

      const { data: vesselRow } = await supabase
        .from('spinytails_vessels')
        .select('id, vessel_code, vessel_name, fisherman_name')
        .eq('id', lotRow.vessel_id)
        .maybeSingle();
      if (vesselRow) setVessel(vesselRow as Vessel);
    })();
  }, [authed, lot_code]);

  // Lay out [count] stickers across ceil(count/10) sheets. Each sheet is
  // a 2×5 grid; positions beyond [count] are blank placeholders that
  // preserve the printable-label geometry.
  const sheets = useMemo(() => {
    const sheetCount = Math.max(1, Math.ceil(count / LABELS_PER_SHEET));
    const out: boolean[][] = [];
    let remaining = count;
    for (let s = 0; s < sheetCount; s++) {
      const sheet: boolean[] = [];
      for (let i = 0; i < LABELS_PER_SHEET; i++) {
        sheet.push(remaining > 0);
        remaining--;
      }
      out.push(sheet);
    }
    return out;
  }, [count]);

  if (authed === null) return <div style={pg}>Loading…</div>;
  if (err)              return <div style={pg}>⚠ {err}</div>;
  if (!lot)             return <div style={pg}>Loading lot…</div>;

  const traceUrl = `${TRACE_BASE}/${encodeURIComponent(lot.lot_code)}`;
  const qrSrc    = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=2&data=${encodeURIComponent(traceUrl)}`;

  return (
    <div style={pg}>
      {/* On-screen controls — hidden when printing */}
      <header className="no-print" style={hdr}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <Link href={`/spinytails/lots/${encodeURIComponent(lot.lot_code)}`} style={back}>← Back to lot {lot.lot_code}</Link>
          <h1 style={h1}>🏷 Trace QR stickers — Avery 5163</h1>
          <p style={sub}>
            Sticker QR → <a href={traceUrl} target="_blank" rel="noreferrer" style={{ color: '#f5c518' }}>{traceUrl}</a><br/>
            Vessel: <strong>{vessel ? `${vessel.vessel_code} · ${vessel.fisherman_name}` : '…'}</strong> · Receipt {lot.receipt_date}
          </p>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>How many stickers?</span>
            {COUNT_PRESETS.map(n => (
              <button key={n} onClick={() => setCount(n)} style={chip(count === n)}>{n}</button>
            ))}
            <input
              type="number" min={1} max={500}
              value={count}
              onChange={e => setCount(Math.max(1, Math.min(500, parseInt(e.target.value || '1', 10))))}
              style={{ background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: 90 }}
            />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>= {sheets.length} sheet{sheets.length === 1 ? '' : 's'}</span>
            <button onClick={() => window.print()} style={printBtn}>🖨 Print</button>
          </div>

          <p style={tip}>
            <strong>Print setup:</strong> US Letter · 100% scale (no "fit to page") · margins OFF or "default" · single-sided. Test on plain paper first to verify alignment with your Avery 5163 sheet.
          </p>
        </div>
      </header>

      {/* The actual printed pages */}
      <div className="print-area">
        {sheets.map((sheet, si) => (
          <section key={si} className="sticker-sheet">
            {sheet.map((filled, i) => (
              <div key={i} className="sticker-cell">
                {filled && (
                  <div className="sticker-inner">
                    <img src={qrSrc} alt={`QR ${lot.lot_code}`} className="sticker-qr" />
                    <div className="sticker-text">
                      <div className="sticker-lotcode">{lot.lot_code}</div>
                      <div className="sticker-line">{vessel?.vessel_code ?? '—'} · {lot.receipt_date}</div>
                      <div className="sticker-line sticker-scan">Scan to verify provenance</div>
                      <div className="sticker-line sticker-url">bscbahamas.com/trace</div>
                      <div className="sticker-brand">Bahamian Seafood Connection · Spiny Tail Processing Co.</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>

      <style jsx global>{`
        @media screen {
          .print-area { background: #94a3b8; padding: 16px 0; }
          .sticker-sheet {
            background: #fff;
            width: 8.5in; height: 11in;
            margin: 0 auto 16px;
            padding: 0.5in 0.156in;
            display: grid;
            grid-template-columns: 4in 4in;
            grid-template-rows: repeat(5, 2in);
            column-gap: 0.156in;
            row-gap: 0;
            box-sizing: border-box;
            box-shadow: 0 6px 24px rgba(0,0,0,0.3);
            color: #060d1f;
          }
        }
        @page {
          size: letter;
          margin: 0;
        }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .print-area { padding: 0; background: #fff; }
          .sticker-sheet {
            width: 8.5in; height: 11in;
            padding: 0.5in 0.156in;
            display: grid;
            grid-template-columns: 4in 4in;
            grid-template-rows: repeat(5, 2in);
            column-gap: 0.156in;
            row-gap: 0;
            box-sizing: border-box;
            color: #000;
            page-break-after: always;
          }
          .sticker-sheet:last-child { page-break-after: auto; }
        }
        .sticker-cell {
          width: 4in; height: 2in;
          box-sizing: border-box;
        }
        .sticker-inner {
          width: 100%; height: 100%;
          padding: 0.12in;
          display: flex;
          gap: 0.12in;
          align-items: center;
          font-family: 'DM Sans', system-ui, sans-serif;
          box-sizing: border-box;
        }
        .sticker-qr {
          width: 1.6in; height: 1.6in;
          flex: 0 0 1.6in;
        }
        .sticker-text {
          flex: 1 1 auto;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          line-height: 1.15;
        }
        .sticker-lotcode {
          font-family: 'Courier New', monospace;
          font-size: 14pt;
          font-weight: 900;
          color: #060d1f;
          letter-spacing: -0.3pt;
          margin-bottom: 2pt;
          word-break: break-all;
        }
        .sticker-line {
          font-size: 8pt;
          color: #1a2e5a;
          margin-bottom: 1pt;
        }
        .sticker-scan {
          font-weight: 700;
          color: #a16207;
          margin-top: 3pt;
        }
        .sticker-url {
          font-family: 'Courier New', monospace;
          font-size: 9pt;
          color: #060d1f;
          font-weight: 700;
        }
        .sticker-brand {
          font-size: 6pt;
          color: #64748b;
          margin-top: 4pt;
          line-height: 1.2;
        }
      `}</style>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 40 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const sub: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, margin: '4px 0 0' };
const tip: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, marginTop: 8, padding: '8px 10px', background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: 6 };
const printBtn: React.CSSProperties = { background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', marginLeft: 'auto' };

const chip = (active: boolean): React.CSSProperties => ({
  background: active ? '#f5c518' : 'rgba(245,197,24,0.15)',
  color: active ? '#060d1f' : '#f5c518',
  border: '1px solid #f5c518',
  borderRadius: 16,
  padding: '4px 12px',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
});
