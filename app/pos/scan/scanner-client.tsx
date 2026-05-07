'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string;
  unit_of_measure: string;
  pack_size: string | null;
  image_url: string | null;
  status: string;
  is_bsc_processed: boolean;
  sell_nassau: boolean;
  sell_andros: boolean;
  sell_online: boolean;
  sell_wholesale: boolean;
};

type CostInfo = { cost_per_unit: number } | null;

type PricingInfo = {
  channel: string;
  pricing_mode: string;
  margin_multiplier: number;
  vat_multiplier: number;
  manual_unit_price: number | null;
};

type LookupResult = {
  product: Product | null;
  cost: CostInfo;
  pricing: PricingInfo[];
};

type UserRecord = {
  id: string;
  email: string;
  role: string;
};

const CATEGORY_OPTIONS = [
  { v: 'fresh_seafood', l: '🐟 Fresh Seafood' },
  { v: 'frozen_seafood', l: '🦞 Frozen Seafood' },
  { v: 'processed_seafood', l: '🦐 Processed' },
  { v: 'meat', l: '🥩 Meat' },
  { v: 'produce', l: '🥦 Produce' },
  { v: 'juice_smoothie', l: '🥤 Juice/Smoothie' },
  { v: 'wellness_shot', l: '💪 Wellness' },
  { v: 'grocery', l: '🌾 Grocery' },
  { v: 'snack', l: '🍪 Snack' },
  { v: 'beverage', l: '💧 Beverage' },
  { v: 'household', l: '🧴 Household' },
  { v: 'toiletry', l: '🧼 Toiletry' },
];

const UNIT_OPTIONS = ['lb', 'kg', 'g', 'oz', 'each', 'case', 'bag', 'box'];

const CHANNEL_LABELS: Record<string, string> = {
  nassau_pos: 'Nassau POS',
  andros_pos: 'Andros POS',
  online_market: 'Online',
  local_wholesale: 'Wholesale',
};

const CHANNEL_DEFAULTS: Record<string, { margin: number; vat: number }> = {
  nassau_pos: { margin: 1.38, vat: 1.00 },
  andros_pos: { margin: 1.43, vat: 1.00 },
  online_market: { margin: 1.25, vat: 1.00 },
  local_wholesale: { margin: 1.12, vat: 1.00 },
};

const EDIT_API = '/api/inventory/movements/update';
const ONBOARD_API = '/api/inventory/onboard';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createBrowserClient(url, key);
}

function computePrice(p: PricingInfo, cost: number | null): number {
  if (p.pricing_mode === 'manual_override' && p.manual_unit_price != null) return Number(p.manual_unit_price);
  if (cost != null) return cost * Number(p.margin_multiplier) * Number(p.vat_multiplier);
  if (p.manual_unit_price != null) return Number(p.manual_unit_price);
  return 0;
}

export default function ScannerClient() {
  const [user, setUser] = useState<UserRecord | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [barcode, setBarcode] = useState('');
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.rpc('get_my_user_record').single<UserRecord>().then(({ data, error }) => {
      if (error || !data) {
        setAuthLoading(false);
        return;
      }
      setUser(data);
      setAuthLoading(false);
    });
  }, []);

  const lookupProduct = useCallback(async (code: string) => {
    setLookingUp(true);
    setLookupError(null);
    setLookupResult(null);
    setPhotoUrl(null);
    setPhotoMsg(null);

    try {
      const supabase = getSupabase();
      const { data: products, error } = await supabase
        .from('products')
        .select('id, sku, barcode, name, description, category, unit_of_measure, pack_size, image_url, status, is_bsc_processed, sell_nassau, sell_andros, sell_online, sell_wholesale')
        .or(`barcode.eq.${code},sku.eq.${code}`)
        .limit(1);

      if (error) throw error;
      const product = products && products.length > 0 ? (products[0] as Product) : null;

      if (!product) {
        setLookupResult({ product: null, cost: null, pricing: [] });
        setLookingUp(false);
        return;
      }

      const { data: costRows } = await supabase
        .from('product_costs')
        .select('cost_per_unit')
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
      setPhotoUrl(product.image_url);
      setLookingUp(false);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Lookup failed');
      setLookingUp(false);
    }
  }, []);

  const handlePhotoUpload = useCallback(async (file: File, productId?: string) => {
    if (!user) return;
    setPhotoUploading(true);
    setPhotoMsg(null);
    try {
      const supabase = getSupabase();
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `products/${Date.now()}-${user.id.slice(0, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('bsc-uploads')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { data: pubData } = supabase.storage.from('bsc-uploads').getPublicUrl(path);
      const newUrl = pubData.publicUrl;
      setPhotoUrl(newUrl);

      if (productId) {
        const res = await fetch(EDIT_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_image',
            product_id: productId,
            image_url: newUrl,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to save photo');
        setPhotoMsg('Photo saved ✓');
        if (scannedCode) lookupProduct(scannedCode);
      } else {
        setPhotoMsg('Photo ready ✓');
      }
    } catch (e) {
      setPhotoMsg(null);
      alert('Photo upload failed: ' + (e instanceof Error ? e.message : 'unknown'));
    } finally {
      setPhotoUploading(false);
    }
  }, [user, scannedCode, lookupProduct]);

  function manualLookup() {
    const code = barcode.trim();
    if (!code) return;
    setScannedCode(code);
    lookupProduct(code);
  }

  function reset() {
    setScannedCode(null);
    setLookupResult(null);
    setLookupError(null);
    setBarcode('');
    setPhotoUrl(null);
    setPhotoMsg(null);
    setEditing(false);
    setOnboarding(false);
  }

  const canEditCostPrice = user && ['founder', 'co_founder', 'manager'].includes(user.role);
  const canOnboard = user && ['founder', 'co_founder', 'manager', 'cashier', 'right_hand', 'supervisor', 'processor', 'andros_staff', 'supplier'].includes(user.role);

  if (authLoading) {
    return (
      <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a2e5a' }}>
        Loading…
      </div>
    );
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
                {user ? `${user.role.toUpperCase()} · ${user.email}` : 'Active session'}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: 16 }}>

        {!scannedCode && !lookingUp && !lookupResult && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 32, marginBottom: 8, textAlign: 'center' }}>⌨️</div>
            <div style={{ fontWeight: 900, fontSize: 16, color: '#1a2e5a', textAlign: 'center', marginBottom: 4 }}>
              Enter Barcode or SKU
            </div>
            <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 16 }}>
              Type the barcode number, paste from a Bluetooth scanner, or enter the SKU
            </div>

            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') manualLookup(); }}
              placeholder="e.g. TROPIC-MAHI-79 or 8901234567890"
              autoFocus
              style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: '1.5px solid #1a2e5a', fontSize: 16, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box', marginBottom: 12 }}
            />

            <button
              onClick={manualLookup}
              disabled={!barcode.trim()}
              style={{ width: '100%', backgroundColor: barcode.trim() ? '#1a2e5a' : '#e5e7eb', color: barcode.trim() ? '#f4c842' : '#999', border: 'none', borderRadius: 12, padding: 14, fontWeight: 900, fontSize: 14, cursor: barcode.trim() ? 'pointer' : 'not-allowed' }}
            >
              🔍 Look up
            </button>

            <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 11, color: '#0369a1' }}>
              💡 Tip: For fastest scanning, pair a Bluetooth barcode scanner. It types the barcode straight into this field.
            </div>
          </div>
        )}

        {lookingUp && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ color: '#1a2e5a', fontWeight: 700 }}>Looking up {scannedCode}…</div>
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

        {lookupResult && lookupResult.product && !lookingUp && !editing && (
          <ProductView
            product={lookupResult.product}
            cost={lookupResult.cost}
            pricing={lookupResult.pricing}
            photoUrl={photoUrl}
            photoUploading={photoUploading}
            photoMsg={photoMsg}
            onPhotoUpload={(f) => handlePhotoUpload(f, lookupResult.product!.id)}
            onEditClick={() => setEditing(true)}
            onReset={reset}
            canEdit={!!canEditCostPrice}
          />
        )}

        {lookupResult && lookupResult.product && editing && (
          <ProductEdit
            product={lookupResult.product}
            cost={lookupResult.cost}
            pricing={lookupResult.pricing}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              if (scannedCode) lookupProduct(scannedCode);
              setEditing(false);
            }}
          />
        )}

        {lookupResult && !lookupResult.product && !lookingUp && !onboarding && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🆕</div>
            <div style={{ fontWeight: 900, fontSize: 16, color: '#1a2e5a', marginBottom: 4 }}>New product</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{scannedCode}</span> is not in your catalog.
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 20 }}>
              {canEditCostPrice ? 'Onboard it now to make it sellable.' : 'Submit it for Dedrick to review and approve.'}
            </div>

            {canOnboard ? (
              <button
                onClick={() => setOnboarding(true)}
                style={{ width: '100%', backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 12, padding: 14, fontWeight: 900, fontSize: 14, cursor: 'pointer', marginBottom: 10 }}
              >
                ➕ Onboard New Product
              </button>
            ) : (
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>Your role cannot onboard products.</div>
            )}

            <button onClick={reset} style={{ width: '100%', backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              ← Try Another Barcode
            </button>
          </div>
        )}

        {lookupResult && !lookupResult.product && onboarding && scannedCode && (
          <ProductOnboard
            barcode={scannedCode}
            photoUrl={photoUrl}
            photoUploading={photoUploading}
            photoMsg={photoMsg}
            onPhotoUpload={(f) => handlePhotoUpload(f)}
            userRole={user?.role || ''}
            onCancel={() => setOnboarding(false)}
            onSaved={() => { reset(); }}
          />
        )}
      </div>
    </div>
  );
}

function ProductView({ product, cost, pricing, photoUrl, photoUploading, photoMsg, onPhotoUpload, onEditClick, onReset, canEdit }: {
  product: Product;
  cost: CostInfo;
  pricing: PricingInfo[];
  photoUrl: string | null;
  photoUploading: boolean;
  photoMsg: string | null;
  onPhotoUpload: (f: File) => void;
  onEditClick: () => void;
  onReset: () => void;
  canEdit: boolean;
}) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', letterSpacing: 1, textTransform: 'uppercase' }}>✓ Found</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#1a2e5a', backgroundColor: '#f4c842', padding: '3px 8px', borderRadius: 4 }}>{product.status.toUpperCase()}</span>
      </div>

      {photoUrl ? (
        <img src={photoUrl} alt={product.name} style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 10, marginBottom: 12 }} />
      ) : (
        <div style={{ width: '100%', height: 140, backgroundColor: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: 10, marginBottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 4 }}>📸</div>
          No product photo yet
        </div>
      )}

      <PhotoUploadButton uploading={photoUploading} onFile={onPhotoUpload} hasPhoto={!!photoUrl} />
      {photoMsg && <div style={{ marginTop: 6, padding: 8, backgroundColor: '#dcfce7', borderRadius: 6, fontSize: 11, color: '#166534', textAlign: 'center', fontWeight: 700 }}>{photoMsg}</div>}

      <div style={{ marginTop: 16, fontWeight: 900, fontSize: 18, color: '#1a2e5a', marginBottom: 4 }}>{product.name}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', marginBottom: 16 }}>
        SKU: {product.sku}{product.barcode ? ` · Barcode: ${product.barcode}` : ''}
      </div>

      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Cost</div>
        {cost ? (
          <div style={{ fontSize: 16, fontWeight: 900, color: '#1a2e5a' }}>${Number(cost.cost_per_unit).toFixed(4)} per {product.unit_of_measure}</div>
        ) : (
          <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 700 }}>⚠️ No cost recorded</div>
        )}
      </div>

      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Selling Prices</div>
        {pricing.length === 0 ? (
          <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 700 }}>⚠️ No pricing configured</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {pricing.map((p) => {
              const px = computePrice(p, cost ? Number(cost.cost_per_unit) : null);
              return (
                <div key={p.channel} style={{ backgroundColor: '#f0f9ff', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', marginBottom: 2 }}>{CHANNEL_LABELS[p.channel] || p.channel}</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#1a2e5a' }}>{px > 0 ? `$${px.toFixed(2)}` : '—'}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canEdit ? (
        <button
          onClick={onEditClick}
          style={{ width: '100%', marginTop: 10, backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
        >
          ✏️ Edit Cost / Price / Channels
        </button>
      ) : (
        <div style={{ marginTop: 10, padding: 10, backgroundColor: '#f8fafc', borderRadius: 8, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
          Cost & price editing requires manager role.
        </div>
      )}

      <button onClick={onReset} style={{ width: '100%', marginTop: 8, backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
        ← Look up Another
      </button>
    </div>
  );
}

function PhotoUploadButton({ uploading, onFile, hasPhoto }: { uploading: boolean; onFile: (f: File) => void; hasPhoto: boolean }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />

      <button
        onClick={() => cameraRef.current?.click()}
        disabled={uploading}
        style={{ backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 12, cursor: uploading ? 'wait' : 'pointer' }}
      >
        {uploading ? 'Uploading…' : hasPhoto ? '📸 Replace Photo' : '📸 Take Photo'}
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{ backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #1a2e5a', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 12, cursor: uploading ? 'wait' : 'pointer' }}
      >
        🖼️ Upload File
      </button>
    </div>
  );
}

function ProductEdit({ product, cost, onCancel, onSaved }: {
  product: Product;
  cost: CostInfo;
  pricing: PricingInfo[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [costInput, setCostInput] = useState<string>(cost ? String(cost.cost_per_unit) : '');
  const [channel, setChannel] = useState<string>('nassau_pos');
  const [pricingMode, setPricingMode] = useState<'formula' | 'manual_override'>('formula');
  const [margin, setMargin] = useState<string>('1.38');
  const [vat, setVat] = useState<string>('1.00');
  const [manualPrice, setManualPrice] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    const def = CHANNEL_DEFAULTS[channel];
    if (def) { setMargin(def.margin.toFixed(2)); setVat(def.vat.toFixed(2)); }
  }, [channel]);

  async function callEdit(payload: object) {
    setSaving(true);
    setErr(null);
    setSavedMsg(null);
    try {
      const res = await fetch(EDIT_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setSavedMsg('Saved ✓');
      setTimeout(onSaved, 800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: '#1a2e5a' }}>{product.name}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{product.sku}</div>
        </div>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 22, color: '#64748b', cursor: 'pointer' }}>×</button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Cost per {product.unit_of_measure} ($)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" step="0.0001" value={costInput} onChange={(e) => setCostInput(e.target.value)} placeholder="e.g. 6.6446" style={{ ...input, marginBottom: 0 }} />
          <button
            onClick={() => callEdit({ action: 'update_cost', product_id: product.id, cost_per_unit: parseFloat(costInput), unit_of_measure: product.unit_of_measure })}
            disabled={saving || !costInput || isNaN(parseFloat(costInput))}
            style={{ backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 8, padding: '0 16px', fontWeight: 800, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Save Cost
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 14, padding: 14, backgroundColor: '#f8fafc', borderRadius: 10 }}>
        <label style={lbl}>Channel</label>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} style={input}>
          <option value="nassau_pos">Nassau POS (38%)</option>
          <option value="andros_pos">Andros POS (43%)</option>
          <option value="online_market">Online (25%)</option>
          <option value="local_wholesale">Wholesale (12%)</option>
        </select>

        <label style={lbl}>Mode</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
          <button onClick={() => setPricingMode('formula')} style={modeBtn(pricingMode === 'formula')}>Formula</button>
          <button onClick={() => setPricingMode('manual_override')} style={modeBtn(pricingMode === 'manual_override')}>Manual</button>
        </div>

        {pricingMode === 'formula' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div><label style={lbl}>Margin</label><input type="number" step="0.01" value={margin} onChange={(e) => setMargin(e.target.value)} style={input} /></div>
            <div><label style={lbl}>VAT</label><input type="number" step="0.01" value={vat} onChange={(e) => setVat(e.target.value)} style={input} /></div>
          </div>
        ) : (
          <input type="number" step="0.01" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="Manual price ($)" style={input} />
        )}

        <button
          onClick={() => callEdit({
            action: 'update_price',
            product_id: product.id,
            channel,
            pricing_mode: pricingMode,
            margin_multiplier: pricingMode === 'formula' ? parseFloat(margin) : null,
            vat_multiplier: parseFloat(vat) || 1.0,
            manual_unit_price: pricingMode === 'manual_override' ? parseFloat(manualPrice) : null,
          })}
          disabled={saving}
          style={primaryBtn(saving)}
        >
          {saving ? 'Saving…' : `Save ${CHANNEL_LABELS[channel]} Price`}
        </button>
      </div>

      <ChannelToggle product={product} onSave={callEdit} saving={saving} />

      {savedMsg && <div style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: 10, fontSize: 12, color: '#166534', textAlign: 'center', marginTop: 10 }}>{savedMsg}</div>}
      {err && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 10, fontSize: 12, color: '#991b1b', marginTop: 10 }}>{err}</div>}

      <button onClick={onCancel} style={{ width: '100%', marginTop: 12, backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
        Done
      </button>
    </div>
  );
}

function ChannelToggle({ product, onSave, saving }: { product: Product; onSave: (p: object) => void; saving: boolean }) {
  const [n, setN] = useState(product.sell_nassau);
  const [a, setA] = useState(product.sell_andros);
  const [o, setO] = useState(product.sell_online);
  const [w, setW] = useState(product.sell_wholesale);

  return (
    <div style={{ marginBottom: 14, padding: 14, backgroundColor: '#f8fafc', borderRadius: 10 }}>
      <div style={{ ...lbl, marginTop: 0 }}>Sales Channels</div>
      {[
        { lab: 'Nassau POS', v: n, s: setN },
        { lab: 'Andros POS', v: a, s: setA },
        { lab: 'Online', v: o, s: setO },
        { lab: 'Wholesale', v: w, s: setW },
      ].map((c) => (
        <label key={c.lab} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer' }}>
          <span style={{ fontSize: 13, color: '#1a2e5a', fontWeight: 600 }}>{c.lab}</span>
          <input type="checkbox" checked={c.v} onChange={(e) => c.s(e.target.checked)} style={{ width: 18, height: 18 }} />
        </label>
      ))}
      <button
        onClick={() => onSave({ action: 'update_channels', product_id: product.id, sell_nassau: n, sell_andros: a, sell_online: o, sell_wholesale: w })}
        disabled={saving}
        style={{ ...primaryBtn(saving), marginTop: 8 }}
      >
        Save Channels
      </button>
    </div>
  );
}

function ProductOnboard({ barcode, photoUrl, photoUploading, photoMsg, onPhotoUpload, userRole, onCancel, onSaved }: {
  barcode: string;
  photoUrl: string | null;
  photoUploading: boolean;
  photoMsg: string | null;
  onPhotoUpload: (f: File) => void;
  userRole: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isManager = ['founder', 'co_founder', 'manager'].includes(userRole);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('frozen_seafood');
  const [unit, setUnit] = useState('lb');
  const [packSize, setPackSize] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [margin, setMargin] = useState('1.38');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !category || !unit)
