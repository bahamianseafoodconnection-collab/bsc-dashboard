'use client';

// Invoice / receipt scanner used by TJ, Claff, Nicholson at intake.
//
// Flow:
//   1. Capture or upload the invoice photo (Camera / Gallery / Files).
//   2. Image uploads to Supabase storage and we get a public URL back.
//   3. User taps "Product Cost" or "Expense" — the form on the right
//      switches to the appropriate quick-entry fields.
//   4. Save: writes to product_costs OR expenses with the receipt URL
//      attached so the founder can audit-trail the source paper later.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useServerSave } from '@/lib/useServerSave';

type Kind = null | 'product_cost' | 'expense';

interface ProductLite { id: string; sku: string; name: string }
interface SupplierLite { id: string; name: string; code: string }

const EXPENSE_CATEGORIES = [
  'salaries', 'utilities', 'rent', 'operations', 'maintenance',
  'accounts_payable', 'fuel', 'office', 'marketing', 'travel', 'other',
];

export default function ScanInvoicePage() {
  // ── Image state ──────────────────────────────────────────
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageUrl, setImageUrl] = useState('');     // public URL after upload
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileRef    = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef  = useRef<HTMLInputElement>(null);

  // Phase 5: expense create + cost receipt route through server-authoritative APIs.
  const { save: recordExpense } = useServerSave('/api/finance/record-expense');
  const { save: recordCost } = useServerSave('/api/products/record-cost');

  function pickImage(f: File | undefined) {
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
    setImageUrl('');
    setUploadError(null);
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return null;
    setUploading(true);
    setUploadError(null);
    try {
      const ext  = imageFile.name.split('.').pop() ?? 'jpg';
      const path = `invoices/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from('site-images')
        .upload(path, imageFile, { upsert: true, contentType: imageFile.type });
      if (error) throw error;
      const { data } = supabase.storage.from('site-images').getPublicUrl(path);
      setImageUrl(data.publicUrl);
      return data.publicUrl;
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
      return null;
    } finally {
      setUploading(false);
    }
  }

  // ── Kind selector + form state ───────────────────────────
  const [kind, setKind] = useState<Kind>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState<{ ok: boolean; msg: string } | null>(null);

  // Product Cost fields
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [pcProductId, setPcProductId] = useState('');
  const [pcSupplierId, setPcSupplierId] = useState('');
  const [pcCostPerUnit, setPcCostPerUnit] = useState('');
  const [pcUnitOfMeasure, setPcUnitOfMeasure] = useState('each');
  const [pcNotes, setPcNotes] = useState('');

  // Expense fields
  const [exDescription, setExDescription] = useState('');
  const [exCategory,    setExCategory]    = useState('operations');
  const [exVendor,      setExVendor]      = useState('');
  const [exAmount,      setExAmount]      = useState('');
  const [exDueDate,     setExDueDate]     = useState('');
  const [exPaidNow,     setExPaidNow]     = useState(true);

  useEffect(() => {
    (async () => {
      const [pRes, sRes] = await Promise.all([
        supabase.from('products').select('id, sku, name').eq('status', 'active').order('name').limit(500),
        supabase.from('suppliers').select('id, name, code').eq('is_active', true).order('name'),
      ]);
      setProducts((pRes.data ?? []) as ProductLite[]);
      setSuppliers((sRes.data ?? []) as SupplierLite[]);
    })();
  }, []);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Save handlers ────────────────────────────────────────
  async function saveProductCost() {
    if (!pcProductId)                         { showToast(false, 'Pick a product first.'); return; }
    const cost = Number(pcCostPerUnit);
    if (Number.isNaN(cost) || cost <= 0)      { showToast(false, 'Cost must be > 0.'); return; }

    setSaving(true);
    let url = imageUrl;
    if (!url && imageFile) {
      const uploaded = await uploadImage();
      if (!uploaded) { setSaving(false); return; }
      url = uploaded;
    }
    const r = await recordCost({
      product_id:      pcProductId,
      supplier_id:     pcSupplierId || null,
      cost_per_unit:   cost,
      unit_of_measure: pcUnitOfMeasure,
      notes:           url ? `Invoice photo: ${url}${pcNotes ? ' — ' + pcNotes : ''}` : (pcNotes || null),
    });
    setSaving(false);
    if (!r.ok) { showToast(false, 'Save failed: ' + (r.error ?? 'unknown error')); return; }
    showToast(true, 'Cost recorded. Founder will review.');
    resetAll();
  }

  async function saveExpense() {
    const description = exDescription.trim();
    const amt         = Number(exAmount);
    if (!description)                     { showToast(false, 'Description is required.'); return; }
    if (Number.isNaN(amt) || amt <= 0)    { showToast(false, 'Amount must be > 0.'); return; }

    setSaving(true);
    let url = imageUrl;
    if (!url && imageFile) {
      const uploaded = await uploadImage();
      if (!uploaded) { setSaving(false); return; }
      url = uploaded;
    }
    const r = await recordExpense({
      description,
      category:   exCategory,
      vendor:     exVendor.trim() || null,
      amount_bsd: amt,
      due_date:   exDueDate || null,
      notes:      url ? `Invoice photo: ${url}` : null,
      paid_now:   exPaidNow,
    });
    setSaving(false);
    if (!r.ok) { showToast(false, 'Save failed: ' + (r.error ?? 'unknown error')); return; }
    showToast(true, 'Expense recorded.');
    resetAll();
  }

  function resetAll() {
    setImageFile(null);
    setImagePreview('');
    setImageUrl('');
    setKind(null);
    setPcProductId(''); setPcSupplierId(''); setPcCostPerUnit(''); setPcUnitOfMeasure('each'); setPcNotes('');
    setExDescription(''); setExCategory('operations'); setExVendor(''); setExAmount(''); setExDueDate(''); setExPaidNow(true);
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif" }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
          padding: '12px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14,
          backgroundColor: toast.ok ? '#16a34a' : '#dc2626', color: '#fff',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>{toast.msg}</div>
      )}

      <header style={{ borderBottom: '1px solid rgba(245,197,24,0.2)', padding: '14px 18px', background: '#0b1628' }}>
        <Link href="/dashboard" style={{ color: '#f5c518', fontSize: 12, textDecoration: 'none' }}>← Dashboard</Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f5c518', fontFamily: "'Playfair Display', serif", margin: '4px 0 0' }}>
          📥 Scan Invoice / Receipt
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
          Snap the paper, pick where it belongs.
        </p>
      </header>

      <main style={{ maxWidth: 700, margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* STEP 1 — capture */}
        <section style={cardStyle}>
          <h2 style={sectionTitle}>1. Capture the invoice</h2>

          <input ref={cameraRef}  type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={(e) => pickImage(e.target.files?.[0])} />
          <input ref={galleryRef} type="file" accept="image/*"                       style={{ display: 'none' }}
            onChange={(e) => pickImage(e.target.files?.[0])} />
          <input ref={fileRef}    type="file" accept="image/*"                       style={{ display: 'none' }}
            onChange={(e) => pickImage(e.target.files?.[0])} />

          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="invoice preview"
              style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 10, background: '#000', marginBottom: 10 }} />
          ) : (
            <div style={{
              padding: '32px 12px', textAlign: 'center', borderRadius: 10,
              background: '#0b1628', border: '1px dashed rgba(245,197,24,0.3)', marginBottom: 10,
            }}>
              <div style={{ fontSize: 42 }}>📷</div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>Pick a source below</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <UploadButton label="Camera" icon="📸" onClick={() => cameraRef.current?.click()} />
            <UploadButton label="Gallery" icon="🖼️" onClick={() => galleryRef.current?.click()} />
            <UploadButton label="Files"   icon="📁" onClick={() => fileRef.current?.click()} />
          </div>

          {imagePreview && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span style={{ fontSize: 11, color: imageUrl ? '#4ade80' : 'rgba(255,255,255,0.5)' }}>
                {uploading ? 'Uploading…' : imageUrl ? '✓ Uploaded' : 'Will upload on save'}
              </span>
              <button onClick={() => { setImageFile(null); setImagePreview(''); setImageUrl(''); }}
                style={smallGhostBtn}>Remove</button>
            </div>
          )}
          {uploadError && <p style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>⚠ {uploadError}</p>}
        </section>

        {/* STEP 2 — kind */}
        <section style={cardStyle}>
          <h2 style={sectionTitle}>2. Where does this belong?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <KindButton active={kind === 'product_cost'} icon="📦" label="Product Cost"
              note="Inventory purchase from a supplier" onClick={() => setKind('product_cost')} />
            <KindButton active={kind === 'expense'}      icon="💸" label="Expense"
              note="Bill, utility, rent, fuel, etc." onClick={() => setKind('expense')} />
          </div>
        </section>

        {/* STEP 3 — form */}
        {kind === 'product_cost' && (
          <section style={cardStyle}>
            <h2 style={sectionTitle}>3. Product cost details</h2>
            <Field label="Product *">
              <select value={pcProductId} onChange={(e) => setPcProductId(e.target.value)} style={inputStyle}>
                <option value="">— Pick a product —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
            </Field>
            <Field label="Supplier">
              <select value={pcSupplierId} onChange={(e) => setPcSupplierId(e.target.value)} style={inputStyle}>
                <option value="">— Optional —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <Field label="Cost per unit *">
                <input type="number" step="0.01" min="0" value={pcCostPerUnit}
                  onChange={(e) => setPcCostPerUnit(e.target.value)} placeholder="e.g. 12.50" style={inputStyle} />
              </Field>
              <Field label="Unit">
                <select value={pcUnitOfMeasure} onChange={(e) => setPcUnitOfMeasure(e.target.value)} style={inputStyle}>
                  <option value="each">each</option>
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </Field>
            </div>
            <Field label="Notes (optional)">
              <input type="text" value={pcNotes} onChange={(e) => setPcNotes(e.target.value)}
                placeholder="e.g. boat delivery 5/16" style={inputStyle} />
            </Field>
            <button onClick={saveProductCost} disabled={saving} style={primaryBtn}>
              {saving ? 'Saving…' : '✓ Save Product Cost'}
            </button>
          </section>
        )}

        {kind === 'expense' && (
          <section style={cardStyle}>
            <h2 style={sectionTitle}>3. Expense details</h2>
            <Field label="Description *">
              <input type="text" value={exDescription} onChange={(e) => setExDescription(e.target.value)}
                placeholder="e.g. BPL Marketplace electricity bill" style={inputStyle} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Category *">
                <select value={exCategory} onChange={(e) => setExCategory(e.target.value)} style={inputStyle}>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Amount BSD *">
                <input type="number" step="0.01" min="0" value={exAmount}
                  onChange={(e) => setExAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
              </Field>
            </div>
            <Field label="Vendor">
              <input type="text" value={exVendor} onChange={(e) => setExVendor(e.target.value)}
                placeholder="e.g. BPL / BTC / TC Marketplace" style={inputStyle} />
            </Field>
            <Field label="Due date">
              <input type="date" value={exDueDate} onChange={(e) => setExDueDate(e.target.value)} style={inputStyle} />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={exPaidNow} onChange={(e) => setExPaidNow(e.target.checked)}
                style={{ accentColor: '#f5c518' }} />
              <span style={{ fontSize: 13 }}>Mark paid now</span>
            </label>
            <button onClick={saveExpense} disabled={saving} style={primaryBtn}>
              {saving ? 'Saving…' : '✓ Save Expense'}
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

// ── Style + helper components ──────────────────────────────
const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: 16,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: '#f5c518',
  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  background: '#1a2e5a', border: '1px solid rgba(245,197,24,0.25)',
  color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
const primaryBtn: React.CSSProperties = {
  width: '100%', padding: 14, borderRadius: 12,
  background: '#f5c518', color: '#060d1f',
  fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', marginTop: 6,
};
const smallGhostBtn: React.CSSProperties = {
  padding: '4px 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
  border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, cursor: 'pointer',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function UploadButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button onClick={onClick} type="button"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '12px 8px', borderRadius: 10,
        background: '#1a2e5a', color: '#f5c518',
        border: '1px solid rgba(245,197,24,0.25)', cursor: 'pointer',
        fontSize: 11, fontWeight: 700,
      }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function KindButton({ active, icon, label, note, onClick }:
  { active: boolean; icon: string; label: string; note: string; onClick: () => void }) {
  return (
    <button onClick={onClick} type="button"
      style={{
        padding: 14, borderRadius: 12, cursor: 'pointer', textAlign: 'left',
        background: active ? '#1a2e5a' : 'rgba(255,255,255,0.04)',
        border: active ? '2px solid #f5c518' : '2px solid rgba(255,255,255,0.08)',
        color: '#fff',
      }}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div style={{ fontWeight: 700, marginTop: 4, color: active ? '#f5c518' : '#fff' }}>{label}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{note}</div>
    </button>
  );
}
