'use client';

// /founder-ai/products/intake
//
// Photo + form product intake. Drop or snap a product photo, type the
// name + description + cost + category, hit submit, and the product
// lands in the pending queue at /founder-ai/products/pending with all
// sell_* flags off so it's NOT live until reviewed and approved.
//
// Pricing is auto-computed via lib/pricing.ts calculatePrice() for the
// three retail channels (nassau_pos 40%, andros_pos 40%, online_market
// 35%) — all +10% VAT — and stored as manual_override product_pricing
// rows so the approval step can edit each before publishing.
//
// Storage: site-images bucket, path products/<sku>-<timestamp>.<ext>.

import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { calculatePrice, vatPctForCategory, type PricingChannel, type SaleUnit } from '@/lib/pricing';
import { capturePhotoGeoMeta, type PhotoGeoMeta } from '@/lib/founder-ai/capture-gps';
import { resolveSubmitterRole, type KnownRole } from '@/lib/founder-ai/role-tagging';
import GpsBadge from '@/components/intake/GpsBadge';

export const dynamic = 'force-dynamic';

// Wider role set — Universal Inventory Intake means every authenticated
// user with a known role can submit. Approval still gated to admins.
const ALLOWED_ROLES = new Set([
  'founder','co_founder','control_admin','basic_admin','manager',
  'cashier','andros_staff','processor','supplier','fisherman',
  'captain','farmer','partner','receiver',
]);

const CATEGORIES = [
  'fresh_seafood','frozen_seafood','meat','frozen_meat',
  'produce','grocery','spices','dry_goods','beverages',
] as const;

const UNITS = ['lb','each','bag','case','pack','portion'] as const;

const VAT_CATEGORIES: Array<{ value: string; label: string; vat: number; hint: string }> = [
  { value: 'uncooked_food',   label: 'Uncooked food (0% VAT)',     vat: 0,  hint: 'Raw seafood, frozen seafood, raw produce, grocery — DEFAULT' },
  { value: 'cooked_prepared', label: 'Cooked / prepared (10% VAT)', vat: 10, hint: 'Juice bar smoothies, kitchen-prepped meals, hot food' },
  { value: 'service',         label: 'Service (0% VAT)',           vat: 0,  hint: 'Labour / consulting / delivery — rare for product catalog' },
];

// Channels we'll create pricing rows for. DB uses 'online_market'
// (canonical column value), but pricing.ts uses 'online_retail' for the
// 35% retail markup — we map at write time.
const RETAIL_CHANNELS: Array<{ db: string; pricingCalc: PricingChannel; label: string; markup: number }> = [
  { db: 'nassau_pos',    pricingCalc: 'nassau_pos',    label: 'Nassau POS',    markup: 40 },
  { db: 'andros_pos',    pricingCalc: 'andros_pos',    label: 'Andros POS',    markup: 40 },
  { db: 'online_market', pricingCalc: 'online_retail', label: 'Online retail', markup: 35 },
];

function slugifyForSku(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

export default function ProductIntakePage() {
  // Suspense boundary required for useSearchParams under Next 15 App Router.
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#060d1f', color: '#fff', padding: 24 }}>Loading…</div>}>
      <ProductIntakeInner />
    </Suspense>
  );
}

function ProductIntakeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleParam = searchParams?.get('role') ?? null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  const [photo,    setPhoto]    = useState<File | null>(null);
  const [preview,  setPreview]  = useState<string | null>(null);
  const [photoGeo, setPhotoGeo] = useState<PhotoGeoMeta | null>(null);
  const [submitterRole, setSubmitterRole] = useState<KnownRole | null>(null);
  const [name,     setName]     = useState('');
  const [description, setDescription] = useState('');
  const [cost,     setCost]     = useState<number>(0);
  const [category, setCategory] = useState<string>('grocery');
  const [unit,     setUnit]     = useState<string>('each');
  const [vatCategory, setVatCategory] = useState<string>('uncooked_food');
  const [supplierId, setSupplierId] = useState<string>('');
  const [skuOverride, setSkuOverride] = useState('');

  const [busy,  setBusy]  = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string; code: string | null }>>([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/founder-ai/products/intake'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ALLOWED_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);

      // Resolve role tag for this submission — URL param wins, else session.
      const r = await resolveSubmitterRole(roleParam);
      setSubmitterRole(r);

      // Load supplier list for the picker
      const { data: sups } = await supabase
        .from('suppliers').select('id, name, code').eq('is_active', true).order('name');
      setSuppliers((sups ?? []) as Array<{ id: string; name: string; code: string | null }>);
    })();
  }, [roleParam]);

  async function onPickFile(file: File | null) {
    setPhoto(file);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
    // Capture GPS the moment the photo lands. GPS denied is NOT a blocker —
    // capturePhotoGeoMeta returns { gps_status: 'denied' } in that case.
    if (file) {
      const geo = await capturePhotoGeoMeta();
      setPhotoGeo(geo);
    } else {
      setPhotoGeo(null);
    }
  }

  function previewPrices(): Array<{ db: string; label: string; price: number; markup: number; vat: number }> {
    const c = cost > 0 ? cost : 0;
    const u = (UNITS.includes(unit as typeof UNITS[number]) ? unit : 'each') as SaleUnit;
    const vat = vatPctForCategory(vatCategory);
    return RETAIL_CHANNELS.map(ch => {
      const r = calculatePrice({ cost: c, channel: ch.pricingCalc, quantity: 1, unit: u, vatPct: vat });
      return { db: ch.db, label: ch.label, price: Math.round(r.finalPrice * 100) / 100, markup: ch.markup, vat };
    });
  }

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 6000);
  }

  async function submit() {
    if (!photo) { showToast(false, '⚠ Photo required'); return; }
    if (!name.trim()) { showToast(false, '⚠ Name required'); return; }
    if (!(cost > 0)) { showToast(false, '⚠ Cost must be greater than 0'); return; }

    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const callerId = session?.user?.id ?? null;

      const sku = (skuOverride.trim() || `${slugifyForSku(name)}-${Date.now().toString(36).toUpperCase()}`).slice(0, 40);

      // 1. Upload image to site-images/products/<sku>-<ts>.<ext>
      const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `products/${sku}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('site-images')
        .upload(path, photo, { upsert: true, contentType: photo.type || `image/${ext === 'jpg' ? 'jpeg' : ext}` });
      if (upErr) { showToast(false, `⚠ Image upload: ${upErr.message}`); return; }
      const { data: urlData } = supabase.storage.from('site-images').getPublicUrl(path);
      const image_url = urlData.publicUrl;

      // 2. INSERT product (pending — all sell_* off)
      const { data: prod, error: prodErr } = await supabase
        .from('products')
        .insert({
          sku,
          name: name.trim(),
          description: description.trim() || null,
          category,
          unit_of_measure: unit,
          unit_type: unit === 'lb' ? 'lb' : null,
          is_bsc_processed: false,
          primary_supplier_id: supplierId || null,
          status: 'active',
          sell_nassau:    false,
          sell_andros:    false,
          sell_online:    false,
          sell_wholesale: false,
          image_url,
          vat_category: vatCategory,
          created_by: callerId,
        })
        .select('id, sku, name')
        .single();
      if (prodErr || !prod) { showToast(false, `⚠ Product insert: ${prodErr?.message ?? 'no row'}`); return; }
      const productId = prod.id as string;

      // 3. INSERT product_costs (immutable; trigger expires nothing — first cost row)
      const nowIso = new Date().toISOString();
      const { error: costErr } = await supabase.from('product_costs').insert({
        product_id:      productId,
        supplier_id:     supplierId || null,
        cost_type:       'opening_balance',
        cost_per_unit:   cost,
        unit_of_measure: unit,
        shipping_per_lb: 0,
        customs_duty_pct: 0,
        vat_levy_pct:    0,
        processing_fee:  0,
        effective_from:  nowIso,
        is_current:      true,
        recorded_by:     callerId,
      });
      if (costErr) console.warn('cost insert failed:', costErr.message);

      // 4. INSERT product_pricing for the 3 retail channels
      const pricingRows = previewPrices().map(p => ({
        product_id:         productId,
        channel:            p.db,
        pricing_mode:       'manual_override',
        margin_multiplier:  1.0,
        vat_multiplier:     1.0,
        manual_unit_price:  p.price,
        shipping_per_lb:    0,
        customs_duty_pct:   0,
        vat_levy_pct:       0,
        per_transaction_fee: 0,
        service_fee_pct:    0,
        effective_from:     nowIso,
        is_current:         true,
        is_active:          true,
        recorded_by:        callerId,
      }));
      const { error: prErr } = await supabase.from('product_pricing').insert(pricingRows);
      if (prErr) {
        // Roll back the product
        await supabase.from('products').delete().eq('id', productId);
        showToast(false, `⚠ Pricing insert: ${prErr.message} (rolled back product)`);
        return;
      }

      // Audit log: insert the intake row so role + GPS travel with the
      // submission to the approval queue. Non-blocking — if the log
      // insert fails, the product is still created and the founder sees
      // it in the pending queue. (The product row is the spec-compliant
      // "nothing until Dedrick approves" point — see /founder-ai/products/pending.)
      try {
        await supabase.from('product_intake_log').insert({
          submitted_by:      callerId,
          submitted_by_role: submitterRole,
          submission_source: 'web',
          raw_payload: {
            sku, name: name.trim(), description: description.trim() || null,
            category, unit_of_measure: unit, cost_per_unit: cost,
            vat_category: vatCategory, supplier_id: supplierId || null,
          },
          photo_urls:      [image_url],
          photo_geo:       photoGeo ? [photoGeo] : [],
          proposed_sku:    sku,
          proposed_name:   name.trim(),
          proposed_supplier_id: supplierId || null,
          extracted_fields: null,
          status:          'pending',
          product_id:      productId,
        });
      } catch (logErr) {
        console.warn('product_intake_log insert failed (non-blocking):', logErr);
      }

      showToast(true, `✓ ${prod.sku} added to pending queue — redirecting to review…`);
      setTimeout(() => router.push('/founder-ai/products/pending'), 900);
    } finally {
      setBusy(false);
    }
  }

  if (authed === null) return <div style={pg}>Loading…</div>;

  const prices = previewPrices();

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Link href="/founder-ai" style={back}>← Founder AI</Link>
          <h1 style={h1}>📷 New product intake</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Upload a photo, fill the basics, hit submit. Lands in the pending queue with auto-computed retail prices. Approve at <Link href="/founder-ai/products/pending" style={{ color: '#4ade80' }}>/founder-ai/products/pending</Link>.
          </p>
          {toast && (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: toast.ok ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
              color:      toast.ok ? '#4ade80' : '#f87171',
              border:    `1px solid ${toast.ok ? '#16a34a' : '#f87171'}` }}>
              {toast.msg}
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
        <div style={card}>
          <label style={lbl}>Photo *</label>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onPickFile(f); }}
            style={{
              border: '2px dashed rgba(245,197,24,0.4)', borderRadius: 12,
              padding: preview ? 0 : 32, textAlign: 'center', cursor: 'pointer',
              background: '#060d1f', overflow: 'hidden', minHeight: 140,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {preview ? (
              <img src={preview} alt="preview" style={{ maxWidth: '100%', maxHeight: 320, display: 'block' }} />
            ) : (
              <div>
                <div style={{ fontSize: 36 }}>📷</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>Tap to pick, drag a photo, or use camera</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>JPG / PNG / HEIC, up to ~10MB</div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            onChange={e => onPickFile(e.target.files?.[0] ?? null)}
            style={{ display: 'none' }} />

          {photo && (
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <GpsBadge geo={photoGeo} />
              {submitterRole && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>
                  Submitting as <strong style={{ color: '#f5c518' }}>{submitterRole}</strong>
                </span>
              )}
            </div>
          )}

          <label style={lbl}>Name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Pig Feet — BWA 5lb bag" style={inp} />

          <label style={lbl}>Description (optional)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            rows={2} placeholder="Anything customers should know — origin, prep, etc." style={{ ...inp, resize: 'vertical' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
            <div>
              <label style={lbl}>Cost per unit (BSD) *</label>
              <input type="number" step="0.01" min="0" value={cost || ''}
                onChange={e => setCost(parseFloat(e.target.value) || 0)}
                placeholder="14.50" style={inp} />
            </div>
            <div>
              <label style={lbl}>Unit of measure</label>
              <select value={unit} onChange={e => setUnit(e.target.value)} style={inp}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
            <div>
              <label style={lbl}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Supplier (optional)</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} style={inp}>
                <option value="">— none —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.code ? `${s.code} · ${s.name}` : s.name}</option>)}
              </select>
            </div>
          </div>

          <label style={lbl}>VAT category (Bahamas tax law)</label>
          <select value={vatCategory} onChange={e => setVatCategory(e.target.value)} style={inp}>
            {VAT_CATEGORIES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            {VAT_CATEGORIES.find(v => v.value === vatCategory)?.hint}
          </div>

          <label style={lbl}>SKU (auto if blank)</label>
          <input type="text" value={skuOverride} onChange={e => setSkuOverride(e.target.value)}
            placeholder={name ? `${slugifyForSku(name)}-…` : 'auto-generated from name'} style={inp} />
        </div>

        {/* Live price preview */}
        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Auto-computed retail prices (editable on approval)
          </div>
          {cost > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
              {prices.map(p => (
                <div key={p.db} style={priceCell}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>{p.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#f5c518' }}>${p.price.toFixed(2)}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{p.markup}% markup + {p.vat}% VAT</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Enter a cost to preview prices.</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <Link href="/founder-ai/products/pending" style={{ ...btn, background: 'transparent', color: '#f5c518', border: '1px solid rgba(245,197,24,0.4)', textDecoration: 'none' }}>
            Review pending →
          </Link>
          <button onClick={submit} disabled={busy} style={{ ...btn, opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Submitting…' : '✓ Add to pending'}
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 14, lineHeight: 1.5 }}>
          The product is created with all channel flags off — it will NOT be live for sale until you approve it at <Link href="/founder-ai/products/pending" style={{ color: '#4ade80' }}>/founder-ai/products/pending</Link>. From there you can edit name, portion fields, and each channel's price before publishing.
        </p>
      </main>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const card: React.CSSProperties = { background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 10, padding: 14 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 4 };
const inp: React.CSSProperties = { background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const priceCell: React.CSSProperties = { background: '#060d1f', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 8, padding: '8px 10px' };
const btn: React.CSSProperties = { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer' };
