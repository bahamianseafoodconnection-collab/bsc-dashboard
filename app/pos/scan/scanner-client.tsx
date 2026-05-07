'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// TYPES
// ============================================================

type ProductMatch = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: string;
  unit_of_measure: string;
  pack_size: string | null;
  status: string;
  is_bsc_processed: boolean;
};

type CostInfo = {
  cost_per_unit: number;
  effective_from: string;
} | null;

type PricingInfo = {
  channel: string;
  pricing_mode: string;
  margin_multiplier: number;
  vat_multiplier: number;
  manual_unit_price: number | null;
};

type LookupResult = {
  product: ProductMatch | null;
  cost: CostInfo;
  pricing: PricingInfo[];
};

// ============================================================
// HELPERS
// ============================================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase environment variables not configured.');
  }
  return createBrowserClient(url, key);
}

function computePriceForChannel(p: PricingInfo, costPerUnit: number | null): number {
  if (p.pricing_mode === 'manual_override' && p.manual_unit_price != null) {
    return Number(p.manual_unit_price);
  }
  if (costPerUnit != null) {
    return costPerUnit * Number(p.margin_multiplier) * Number(p.vat_multiplier);
  }
  if (p.manual_unit_price != null) {
    return Number(p.manual_unit_price);
  }
  return 0;
}

const CHANNEL_LABELS: Record<string, string> = {
  nassau_pos: 'Nassau POS',
  andros_pos: 'Andros POS',
  online_market: 'Online',
  local_wholesale: 'Wholesale',
  us_resale: 'US Resale',
};

// ============================================================
// COMPONENT
// ============================================================

export default function ScannerClient() {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<unknown>(null);

  const [scanning, setScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const stopScanner = useCallback(async () => {
    const inst = html5QrCodeRef.current as { stop?: () => Promise<void>; clear?: () => void } | null;
    if (inst?.stop) {
      try { await inst.stop(); } catch { /* ignore */ }
    }
    if (inst?.clear) {
      try { inst.clear(); } catch { /* ignore */ }
    }
    html5QrCodeRef.current = null;
    setScanning(false);
  }, []);

  const lookupProduct = useCallback(async (barcode: string) => {
    setLookingUp(true);
    setLookupError(null);
    setLookupResult(null);

    try {
      const supabase = getSupabase();

      const { data: products, error: prodErr } = await supabase
        .from('products')
        .select('id, sku, barcode, name, category, unit_of_measure, pack_size, status, is_bsc_processed')
        .or(`barcode.eq.${barcode},sku.eq.${barcode}`)
        .limit(1);

      if (prodErr) throw prodErr;

      const product = products && products.length > 0 ? (products[0] as ProductMatch) : null;

      if (!product) {
        setLookupResult({ product: null, cost: null, pricing: [] });
        setLookingUp(false);
        return;
      }

      const { data: costRows } = await supabase
        .from('product_costs')
        .select('cost_per_unit, effective_from')
        .eq('product_id', product.id)
        .eq('is_current', true)
        .limit(1);

      const cost = costRows && costRows.length > 0 ? (costRows[0] as CostInfo) : null;

      const { data: pricingRows } = await supabase
        .from('product_pricing')
        .select('channel, pricing_mode, margin_multiplier, vat_multiplier, manual_unit_price')
        .eq('product_id', product.id)
        .eq('is_current', true)
        .eq('is_active', true);

      setLookupResult({
        product,
        cost,
        pricing: (pricingRows || []) as PricingInfo[],
      });
      setLookingUp(false);
    } catch (e) {
      console.error('Lookup failed:', e);
      setLookupError(e instanceof Error ? e.message : 'Lookup failed');
      setLookingUp(false);
    }
  }, []);

  const startScanner = useCallback(async () => {
    setScannerError(null);
    setScannedCode(null);
    setLookupResult(null);
    setLookupError(null);

    try {
      const mod = await import('html5-qrcode');
      const Html5Qrcode = mod.Html5Qrcode;

      if (!scannerRef.current) {
        setScannerError('Scanner container not ready.');
        return;
      }

      const containerId = 'bsc-scanner-region';
      scannerRef.current.id = containerId;

      const instance = new Html5Qrcode(containerId);
      html5QrCodeRef.current = instance;

      setScanning(true);

      await instance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        async (decodedText) => {
          setScannedCode(decodedText);
          await stopScanner();
          await lookupProduct(decodedText);
        },
        () => { /* per-frame failures, ignore */ }
      );
    } catch (e) {
      console.error('Scanner start failed:', e);
      const msg = e instanceof Error ? e.message : 'Could not start camera';
      setScannerError(`${msg}. Make sure you allowed camera permission.`);
      setScanning(false);
    }
  }, [stopScanner, lookupProduct]);

  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

  function manualLookup() {
    const code = manualBarcode.trim();
    if (!code) return;
    setScannedCode(code);
    lookupProduct(code);
  }

  function reset() {
    setScannedCode(null);
    setLookupResult(null);
    setLookupError(null);
    setManualBarcode('');
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/pos" style={{ color: '#f4c842', fontSize: 13, fontWeight: 700, textDecoration: 'none', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: 8 }}>
              ← Register
            </Link>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: 15 }}>📷 Scanner</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
                Active session
              </div>
            </div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: 16 }}>

        {!scannedCode && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#1a2e5a', marginBottom: 12 }}>
              {scanning ? 'Scanning… point camera at barcode' : 'Tap to start scanning'}
            </div>

            <div
              ref={scannerRef}
              style={{
                width: '100%',
                aspectRatio: '4/3',
                backgroundColor: scanning ? '#000' : '#e2e8f0',
                borderRadius: 12,
                marginBottom: 12,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {!scanning && (
                <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>📷</div>
                  <div style={{ fontSize: 13 }}>Camera will appear here</div>
                </div>
              )}
            </div>

            {scannerError && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 12, color: '#991b1b', fontSize: 12, marginBottom: 12 }}>
                {scannerError}
              </div>
            )}

            {!scanning ? (
              <button
                onClick={startScanner}
                style={{ width: '100%', backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 12, padding: 14, fontWeight: 900, fontSize: 14, cursor: 'pointer', marginBottom: 10 }}
              >
                📷 Start Camera Scan
              </button>
            ) : (
              <button
                onClick={stopScanner}
                style={{ width: '100%', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontWeight: 900, fontSize: 14, cursor: 'pointer', marginBottom: 10 }}
              >
                ✕ Stop Scanner
              </button>
            )}

            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Or enter barcode / SKU manually
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  placeholder="Type or paste barcode/SKU"
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
                <button
                  onClick={manualLookup}
                  disabled={!manualBarcode.trim()}
                  style={{ backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 800, fontSize: 13, cursor: manualBarcode.trim() ? 'pointer' : 'not-allowed', opacity: manualBarcode.trim() ? 1 : 0.5 }}
                >
                  Look up
                </button>
              </div>
            </div>
          </div>
        )}

        {lookingUp && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ color: '#1a2e5a', fontWeight: 700 }}>Looking up barcode {scannedCode}…</div>
          </div>
        )}

        {lookupError && !lookingUp && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 16, padding: 20, marginBottom: 16 }}>
            <div style={{ fontWeight: 800, color: '#991b1b', marginBottom: 6 }}>Lookup failed</div>
            <div style={{ fontSize: 12, color: '#991b1b' }}>{lookupError}</div>
            <button onClick={reset} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid #991b1b', backgroundColor: '#fff', color: '#991b1b', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              ← Try again
            </button>
          </div>
        )}

        {lookupResult && lookupResult.product && !lookingUp && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', letterSpacing: 1, textTransform: 'uppercase' }}>
                ✓ Product Found
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#1a2e5a', backgroundColor: '#f4c842', padding: '3px 8px', borderRadius: 4 }}>
                {lookupResult.product.status.toUpperCase()}
              </span>
            </div>

            <div style={{ fontWeight: 900, fontSize: 18, color: '#1a2e5a', marginBottom: 4 }}>
              {lookupResult.product.name}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', marginBottom: 16 }}>
              SKU: {lookupResult.product.sku}
              {lookupResult.product.barcode && <> · Barcode: {lookupResult.product.barcode}</>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div style={{ backgroundColor: '#f8fafc', padding: 10, borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 2 }}>Category</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2e5a' }}>{lookupResult.product.category}</div>
              </div>
              <div style={{ backgroundColor: '#f8fafc', padding: 10, borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 2 }}>Unit</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2e5a' }}>{lookupResult.product.unit_of_measure}</div>
              </div>
              {lookupResult.product.pack_size && (
                <div style={{ backgroundColor: '#f8fafc', padding: 10, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 2 }}>Pack Size</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2e5a' }}>{lookupResult.product.pack_size}</div>
                </div>
              )}
              <div style={{ backgroundColor: lookupResult.product.is_bsc_processed ? '#fef3c7' : '#f8fafc', padding: 10, borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 2 }}>Source</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2e5a' }}>
                  {lookupResult.product.is_bsc_processed ? '🐟 BSC Processed' : 'Sourced'}
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                Current Cost
              </div>
              {lookupResult.cost ? (
                <div style={{ fontSize: 16, fontWeight: 900, color: '#1a2e5a' }}>
                  ${Number(lookupResult.cost.cost_per_unit).toFixed(4)} per {lookupResult.product.unit_of_measure}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 700 }}>⚠️ No cost recorded</div>
              )}
            </div>

            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Selling Prices
              </div>
              {lookupResult.pricing.length === 0 ? (
                <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 700 }}>⚠️ No pricing configured</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {lookupResult.pricing.map((p) => {
                    const computedPrice = computePriceForChannel(p, lookupResult.cost ? Number(lookupResult.cost.cost_per_unit) : null);
                    return (
                      <div key={p.channel} style={{ backgroundColor: '#f0f9ff', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', marginBottom: 2 }}>
                          {CHANNEL_LABELS[p.channel] || p.channel}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#1a2e5a' }}>
                          {computedPrice > 0 ? `$${computedPrice.toFixed(2)}` : '—'}
                        </div>
                        <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                          {p.pricing_mode === 'formula'
                            ? `formula × ${Number(p.margin_multiplier).toFixed(2)} × ${Number(p.vat_multiplier).toFixed(2)}`
                            : 'manual'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
              <Link
                href={`/pos/inventory?edit=${lookupResult.product.id}`}
                style={{ backgroundColor: '#1a2e5a', color: '#f4c842', textDecoration: 'none', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, textAlign: 'center' }}
              >
                ✏️ Edit in Inventory
              </Link>
              <button
                disabled
                title="Coming soon"
                style={{ backgroundColor: '#e5e7eb', color: '#94a3b8', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'not-allowed' }}
              >
                📦 Adjust Stock
              </button>
            </div>

            <button onClick={reset} style={{ width: '100%', marginTop: 10, backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              ← Scan Another
            </button>
          </div>
        )}

        {lookupResult && !lookupResult.product && !lookingUp && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🆕</div>
            <div style={{ fontWeight: 900, fontSize: 16, color: '#1a2e5a', marginBottom: 4 }}>
              New product
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
              Barcode <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{scannedCode}</span> is not in your catalog.
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 20 }}>
              Onboard it now to start tracking cost, price, and inventory.
            </div>

            <button
              disabled
              title="Coming soon"
              style={{ width: '100%', backgroundColor: '#e5e7eb', color: '#94a3b8', border: 'none', borderRadius: 12, padding: 14, fontWeight: 900, fontSize: 14, cursor: 'not-allowed', marginBottom: 10 }}
            >
              ➕ Onboard New Product
            </button>

            <button onClick={reset} style={{ width: '100%', backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              ← Scan Another
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
