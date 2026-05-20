'use client';

// /trace — Public traceability search.
//
// Customer landing for "verify your seafood" QR codes printed on
// receipts + BSC product labels. Enter a lot/batch code and we
// redirect to the existing /trace/[batch_number] page which calls
// the SECURITY DEFINER get_public_trace() RPC.
//
// Accepts BOTH old-style batch numbers (BSC-FISH-YYYYMMDD-NNN) AND
// the new Spiny Tails lot codes (STPC-YYYYMMDD-VV-NN) — the get_public_trace
// function already handles both formats (lot_code OR batch_number).

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function TraceIndexPage() {
  const [code, setCode]   = useState('');
  const [err, setErr]     = useState<string | null>(null);
  const router            = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase().replace(/\s+/g, '');
    if (!c) { setErr('Enter a lot or batch code from your package.'); return; }
    // Accept any non-empty code. The trace page handles "not found".
    router.push(`/trace/${encodeURIComponent(c)}`);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fbfaf6', fontFamily: "'DM Sans', system-ui, sans-serif", color: '#1a2e5a' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '14px 16px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/bsc-marketplace-logo.png" alt="BSC Market Place" style={{ height: 56, width: 'auto', display: 'block' }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: '#a16207', textTransform: 'uppercase' }}>
                Bahamian Seafood Connection
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>Traceability portal</div>
            </div>
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px' }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#a16207', textTransform: 'uppercase', margin: 0 }}>
            🧾 Verify your purchase
          </p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: '#1a2e5a', margin: '8px 0 4px' }}>
            Where did your seafood come from?
          </h1>
          <p style={{ fontSize: 14, color: '#475569', margin: '0 0 18px', lineHeight: 1.55 }}>
            Find the <strong>lot code</strong> printed on your BSC package (looks like <code style={{ background: '#fef3c7', padding: '1px 6px', borderRadius: 4, fontFamily: 'ui-monospace, Menlo, monospace' }}>STPC-20260805-AT-01</code> or <code style={{ background: '#fef3c7', padding: '1px 6px', borderRadius: 4, fontFamily: 'ui-monospace, Menlo, monospace' }}>BSC-FISH-20260805-001</code>) and enter it below to see the vessel, captain, fishing area, and full chain of custody from the boat to your plate.
          </p>

          <form onSubmit={submit}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
              Lot or batch code
            </label>
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value); setErr(null); }}
              placeholder="STPC-20260805-AT-01"
              autoFocus
              spellCheck={false}
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 10,
                border: '2px solid ' + (err ? '#f87171' : '#e2e8f0'),
                fontSize: 18, fontFamily: 'ui-monospace, Menlo, monospace',
                textTransform: 'uppercase', letterSpacing: 1, color: '#1a2e5a',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            {err && <p style={{ fontSize: 12, color: '#9b1c1c', margin: '6px 0 0' }}>{err}</p>}

            <button type="submit"
              style={{
                width: '100%', marginTop: 16,
                background: '#1a2e5a', color: '#f5c518', border: 'none',
                borderRadius: 10, padding: '14px 16px', fontSize: 15, fontWeight: 900, cursor: 'pointer',
                letterSpacing: 0.4,
              }}>
              🔍 Look up trace →
            </button>
          </form>

          <hr style={{ border: 'none', borderTop: '1px solid #f0f0f0', margin: '24px 0' }} />

          <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, margin: 0 }}>
            <strong>What you&rsquo;ll see:</strong> the fishing vessel + captain, fishing area + dates, receiving temperature, HACCP critical-control checks at every step (CCP-1 receiving, CCP-2 thawing, CCP-3 de-veining, CCP-4 blast freezing, CCP-5 labeling), and processing yield. Independent verification of provenance and food-safety compliance.
          </p>
        </div>

        <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 18 }}>
          Bahamian Seafood Connection · Fire Trail Road, Nassau · 242-822-6180 · admin@bscbahamas.com
        </p>
      </main>
    </div>
  );
}
