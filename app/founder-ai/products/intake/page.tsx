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

// UoM suggestions only — the input is free-text per founder direction
// (2026-05-26: "ensure all unit of measure can be input per product").
// Any value the supplier types is accepted at the DB layer (products
// .unit_of_measure is plain TEXT, no enum).
const UNIT_SUGGESTIONS = [
  'lb','each','bag','case','pack','portion','kit','dozen','oz','g','kg','ml','L','box','tray','flat','bundle','head','bunch',
] as const;

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

  // Up to 3 photos per submission. Each photo carries its own GPS metadata
  // (geos[i] aligned to photos[i] aligned to previews[i]). First photo is
  // the "primary" — copied to products.image_url so /market displays it.
  // All photos + geos travel together in product_intake_log.
  const MAX_PHOTOS = 3;
  const [photos,    setPhotos]    = useState<File[]>([]);
  const [previews,  setPreviews]  = useState<string[]>([]);
  const [photoGeos, setPhotoGeos] = useState<PhotoGeoMeta[]>([]);
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

  async function onAddPhoto(file: File | null) {
    if (!file) return;
    if (photos.length >= MAX_PHOTOS) {
      showToast(false, `⚠ Max ${MAX_PHOTOS} photos per submission`);
      return;
    }
    // Capture GPS the moment the photo lands — denied/timeout are NOT blockers.
    const geo = await capturePhotoGeoMeta();
    setPhotos(p => [...p, file]);
    setPreviews(p => [...p, URL.createObjectURL(file)]);
    setPhotoGeos(g => [...g, geo]);
  }

  function onRemovePhoto(index: number) {
    const url = previews[index];
    if (url) URL.revokeObjectURL(url);
    setPhotos(p => p.filter((_, i) => i !== index));
    setPreviews(p => p.filter((_, i) => i !== index));
    setPhotoGeos(g => g.filter((_, i) => i !== index));
  }

  function previewPrices(): Array<{ db: string; label: string; price: number; markup: number; vat: number }> {
    const c = cost > 0 ? cost : 0;
    // pricing.ts uses 'each' as the safe default for unknown UoM —
    // pricing math doesn't actually depend on the unit string, only
    // on quantity. Map anything we don't recognize to 'each'.
    const KNOWN_FOR_PRICING = new Set<string>(['lb','each','bag','case','pack','portion']);
    const u = (KNOWN_FOR_PRICING.has(unit) ? unit : 'each') as SaleUnit;
    const vat = vatPctForCategory(vatCategory);
    return RETAIL_CHANNELS.map(ch => {
      const r = calculatePrice({ cost: c, channel: ch.pricingCalc, quantity: 1, unit: u, vatPct: vat });
      return { db: ch.db, label: ch.label, price: Math.round(r.finalPrice * 100) / 100, markup: ch.markup, vat };
    });
  }

  function showToast(ok: boolean, msg: string) {
    // PERSISTENT — no auto-dismiss. User dismisses with the × button.
    // (Old 6-sec auto-dismiss meant Claff missed the error and re-tried;
    // now it stays until acknowledged.)
    setToast({ ok, msg });
  }

  function clearFormForNext() {
    // Clear photo-related state but keep category / unit / vat / supplier
    // so the user can rapid-fire similar products from the same shelf.
    setPhotos([]);
    for (const u of previews) URL.revokeObjectURL(u);
    setPreviews([]);
    setPhotoGeos([]);
    setName('');
    setDescription('');
    setCost(0);
    setSkuOverride('');
    // Reset file input so the same file can be re-selected later.
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit() {
    if (photos.length === 0) { showToast(false, '⚠ At least 1 photo required'); return; }
    if (!name.trim()) { showToast(false, '⚠ Name required'); return; }
    if (!(cost > 0)) { showToast(false, '⚠ Cost must be greater than 0'); return; }

    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) { showToast(false, '⚠ Sign-in expired — refresh the page.'); return; }

      const sku = (skuOverride.trim() || `${slugifyForSku(name)}-${Date.now().toString(36).toUpperCase()}`).slice(0, 40);

      // 1. Upload every photo client-side to site-images. This bucket is
      //    publicly readable; uploads succeed for all authenticated users
      //    (the bucket policy + service_role-on-server makes this safe).
      const uploadedUrls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `products/${sku}-${i}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('site-images')
          .upload(path, file, { upsert: true, contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}` });
        if (upErr) { showToast(false, `⚠ Photo ${i + 1} upload: ${upErr.message}`); return; }
        const { data: urlData } = supabase.storage.from('site-images').getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      // 2. Send everything to the server-side API. The API uses
      //    service_role to bypass RLS on products / product_costs /
      //    product_pricing — which is why this works for cashier /
      //    fisherman / supplier / etc. who don't have direct INSERT.
      const res = await fetch('/api/products/intake-submit', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sku, name: name.trim(),
          description:    description.trim() || null,
          category,
          unit,
          vat_category:   vatCategory,
          cost_per_unit:  cost,
          supplier_id:    supplierId || null,
          prices:         previewPrices().map(p => ({ channel: p.db, price: p.price })),
          image_url:      uploadedUrls[0],
          photo_urls:     uploadedUrls,
          photo_geo:      photoGeos,
          submitted_by_role: submitterRole,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showToast(false, `⚠ ${json.error ?? `Submit failed (${res.status})`}`);
        return;
      }

      // SUCCESS — clear form, STAY on page, show a sticky success that
      // points to the pending queue. User can keep adding without
      // navigating away (per Claff's feedback).
      showToast(true, `✓ ${json.sku} saved — Dedrick will see it at /founder-ai/products/pending. Ready for the next product.`);
      clearFormForNext();
    } catch (e) {
      showToast(false, `⚠ ${e instanceof Error ? e.message : 'Submit crashed'}`);
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/dashboard" style={back}>← Back to Dashboard</Link>
            <Link href="/founder-ai/products/pending" style={{ ...back, color: '#4ade80' }}>Pending queue →</Link>
          </div>
          <h1 style={h1}>📷 New product intake</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Upload up to 3 photos, fill the basics, hit submit. Lands in the pending queue with auto-computed retail prices. Form clears after each save — keep going.
          </p>
          {toast && (
            <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
              background: toast.ok ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)',
              color:      toast.ok ? '#4ade80' : '#f87171',
              border:    `1px solid ${toast.ok ? '#16a34a' : '#f87171'}` }}>
              <span>{toast.msg}</span>
              <button onClick={() => setToast(null)}
                style={{ background: 'transparent', color: 'inherit', border: 'none', cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}
                aria-label="Dismiss">×</button>
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
        <div style={card}>
          <label style={lbl}>Photos * <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, marginLeft: 4 }}>(up to {MAX_PHOTOS} — front, label, wide)</span></label>

          {/* Thumbnails grid — one per uploaded photo with GPS badge + remove */}
          {photos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(photos.length, MAX_PHOTOS)}, 1fr)`, gap: 8, marginBottom: 8 }}>
              {photos.map((file, i) => (
                <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#060d1f', border: '1px solid rgba(245,197,24,0.25)' }}>
                  <img src={previews[i]} alt={`photo ${i + 1}`} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                  <button onClick={() => onRemovePhoto(i)} type="button"
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#f87171', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontSize: 11, fontWeight: 800 }}
                    title="Remove">🗑</button>
                  <div style={{ position: 'absolute', bottom: 4, left: 4, display: 'flex', gap: 4 }}>
                    {i === 0 && <span style={{ background: 'rgba(245,197,24,0.9)', color: '#060d1f', borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 800 }}>PRIMARY</span>}
                    <GpsBadge geo={photoGeos[i]} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add-another button (or initial drop zone) */}
          {photos.length < MAX_PHOTOS && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onAddPhoto(f); }}
              style={{
                border: '2px dashed rgba(245,197,24,0.4)', borderRadius: 12,
                padding: photos.length === 0 ? 32 : 14, textAlign: 'center', cursor: 'pointer',
                background: '#060d1f', minHeight: photos.length === 0 ? 140 : 'auto',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <div>
                <div style={{ fontSize: photos.length === 0 ? 36 : 22 }}>📷</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>
                  {photos.length === 0
                    ? 'Tap to pick, drag a photo, or use back camera'
                    : `Add another photo (${photos.length}/${MAX_PHOTOS})`}
                </div>
                {photos.length === 0 && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>JPG / PNG / HEIC, up to ~10MB · GPS captures automatically</div>}
              </div>
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            onChange={e => { const f = e.target.files?.[0]; if (f) onAddPhoto(f); if (fileRef.current) fileRef.current.value = ''; }}
            style={{ display: 'none' }} />

          {photos.length > 0 && submitterRole && (
            <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.55)', textAlign: 'right' }}>
              Submitting as <strong style={{ color: '#f5c518' }}>{submitterRole}</strong>
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
              <input
                type="text"
                value={unit}
                onChange={e => setUnit(e.target.value)}
                list="intake-uom-suggestions"
                placeholder="e.g. lb, each, 3.3lb, 24ct case…"
                style={inp}
              />
              <datalist id="intake-uom-suggestions">
                {UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}
              </datalist>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                Type any unit — the suggestions list is just a starting point.
              </div>
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
