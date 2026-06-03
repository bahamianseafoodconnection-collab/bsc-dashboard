'use client';

// /supplier/[id] — focused supplier management page.
//
// Tap a supplier card on /supplier → land here for that supplier only.
// Header has two back paths: ← Suppliers and ← Dashboard, so the founder
// can always escape one level OR all the way out in one tap.
//
// Layout:
//   • Top bar: back buttons + supplier name + type badge
//   • Pricelist row: link / upload / replace + 🔮 extract
//   • Search bar to filter that supplier's products
//   • Grid of product cards (image, name, SKU, cost, channels, disable/enable)
//   • + Add Product CTA (links to /admin/inventory?supplier=<id> for the
//     full editor — keeps this page focused on overview/triage rather
//     than every form field)
//
// All product writes go through existing endpoints — /api/admin/products/:id
// for disable + channel updates. No new backend code, just a tighter UI.

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { canLock, useUserRole } from '@/lib/role';

interface Supplier {
  id: string;
  code: string;
  name: string;
  supplier_type: string;
  brand_color: string | null;
  brand_emoji: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  payment_terms: string | null;
  is_active: boolean;
  pricelist_url: string | null;
  pricelist_filename: string | null;
  pricelist_uploaded_at: string | null;
}

interface SupplierProduct {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit_of_measure: string | null;
  pack_size: string | null;
  status: string;
  image_url: string | null;
  sell_nassau: boolean;
  sell_andros: boolean;
  sell_online: boolean;
  sell_wholesale: boolean;
}

interface ExtractedProduct {
  raw_line: string;
  name: string;
  unit_of_measure: string;
  pack_size: string | null;
  cost_per_unit: number | null;
  suggested_category: string;
  suggested_sku: string;
  notes: string | null;
  sku: string;
  category: string;
  skip: boolean;
  sell_nassau: boolean;
  sell_andros: boolean;
  sell_online: boolean;
  sell_wholesale: boolean;
}
interface ExtractDiagnostic {
  raw_products_count: number;
  claude_preview: string;
  pdf_bytes: number;
}

const CATEGORIES_FOR_EXTRACT = [
  'Seafood','Meat','Poultry','Produce','Dry Goods','Frozen',
  'Dairy & Eggs','Beverages','Snacks','Cleaning & Paper','Personal Care','Other',
];

export default function SupplierDetailPage() {
  const params  = useParams<{ id: string }>();
  const id      = params?.id ?? '';
  const router  = useRouter();
  const { role } = useUserRole();
  const canEdit = canLock(role);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [supplier,  setSupplier]  = useState<Supplier | null>(null);
  const [products,  setProducts]  = useState<SupplierProduct[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [pricelistBusy, setPricelistBusy] = useState(false);
  const [extractModal, setExtractModal] = useState<null | {
    loading: boolean; error: string | null; products: ExtractedProduct[];
    importing: boolean; diagnostic: ExtractDiagnostic | null;
  }>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: sup } = await supabase.from('suppliers').select('*').eq('id', id).maybeSingle();
    setSupplier(sup as Supplier | null);
    const { data: prods } = await supabase
      .from('products')
      .select('id, sku, name, category, unit_of_measure, pack_size, status, image_url, sell_nassau, sell_andros, sell_online, sell_wholesale')
      .eq('primary_supplier_id', id)
      .order('name');
    setProducts((prods ?? []) as SupplierProduct[]);
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => { load(); }, [load]);

  // ── Pricelist upload (reuses the same bucket + suppliers columns) ──
  async function uploadPricelist(file: File) {
    if (!supplier) return;
    setPricelistBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ext  = file.name.split('.').pop() ?? 'pdf';
      const path = `${supplier.id}/pricelist-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('supplier-pricelists')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) { showToast(`Upload failed: ${upErr.message}`, false); return; }
      const { data: pub } = supabase.storage.from('supplier-pricelists').getPublicUrl(path);
      const { error: updErr } = await supabase.from('suppliers').update({
        pricelist_url:         pub.publicUrl,
        pricelist_filename:    file.name,
        pricelist_uploaded_at: new Date().toISOString(),
        pricelist_uploaded_by: user?.id ?? null,
        updated_at:            new Date().toISOString(),
      }).eq('id', supplier.id);
      if (updErr) { showToast(`Save failed: ${updErr.message}`, false); return; }
      showToast(`📄 Pricelist uploaded`);
      await load();
    } finally {
      setPricelistBusy(false);
    }
  }

  // ── Extract products from pricelist (Claude → review → bulk import) ──
  async function startExtract() {
    if (!supplier) return;
    setExtractModal({ loading: true, error: null, products: [], importing: false, diagnostic: null });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setExtractModal({ loading: false, error: 'Sign-in expired — refresh.', products: [], importing: false, diagnostic: null });
        return;
      }
      const res = await fetch('/api/supplier/extract-pricelist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ supplier_id: supplier.id }),
        cache:   'no-store',
      });
      const rawBody = await res.text();
      let j: { ok?: boolean; error?: string; products?: ExtractedProduct[]; diagnostic?: ExtractDiagnostic | null };
      try { j = JSON.parse(rawBody); }
      catch {
        setExtractModal({
          loading: false, error: `HTTP ${res.status} · non-JSON (first 400 chars): ${rawBody.slice(0, 400)}`,
          products: [], importing: false, diagnostic: null,
        });
        return;
      }
      if (!res.ok || !j.ok) {
        setExtractModal({ loading: false, error: j.error || `HTTP ${res.status}`, products: [], importing: false, diagnostic: null });
        return;
      }
      const isWP = supplier.supplier_type === 'wholesale_partner';
      const rows: ExtractedProduct[] = (j.products || []).map((p) => ({
        ...p,
        sku:           p.suggested_sku,
        category:      p.suggested_category,
        skip:          p.cost_per_unit == null,
        sell_nassau:   true,
        sell_andros:   false,
        sell_online:   false,
        sell_wholesale: isWP,
      }));
      setExtractModal({
        loading: false, error: null, products: rows, importing: false,
        diagnostic: (j.diagnostic ?? null) as ExtractDiagnostic | null,
      });
    } catch (e) {
      setExtractModal({
        loading: false, error: e instanceof Error ? e.message : 'Extract failed',
        products: [], importing: false, diagnostic: null,
      });
    }
  }
  function patchExtractRow(idx: number, patch: Partial<ExtractedProduct>) {
    setExtractModal(prev => prev ? {
      ...prev, products: prev.products.map((p, i) => i === idx ? { ...p, ...patch } : p),
    } : prev);
  }
  async function importExtracted() {
    if (!supplier || !extractModal) return;
    const rowsToImport = extractModal.products.filter(p => !p.skip);
    if (rowsToImport.length === 0) { showToast('Nothing to import — all rows skipped.', false); return; }
    setExtractModal({ ...extractModal, importing: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { showToast('Sign-in expired — refresh.', false); setExtractModal({ ...extractModal, importing: false }); return; }
      const res = await fetch('/api/supplier/bulk-add-products', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          supplier_id: supplier.id,
          rows: rowsToImport.map(p => ({
            sku: p.sku, name: p.name, category: p.category,
            unit_of_measure: p.unit_of_measure, pack_size: p.pack_size,
            cost_per_unit: p.cost_per_unit,
            channels: { nassau: p.sell_nassau, andros: p.sell_andros, online: p.sell_online, wholesale: p.sell_wholesale },
          })),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        showToast(`Import failed: ${j.error || `HTTP ${res.status}`}`, false);
        setExtractModal({ ...extractModal, importing: false });
        return;
      }
      const failed = (j.failed ?? []) as Array<unknown>;
      showToast(`📦 Imported ${j.inserted} product${j.inserted === 1 ? '' : 's'}${failed.length ? ` · ${failed.length} failed` : ''}`);
      setExtractModal(null);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Import failed', false);
      setExtractModal(prev => prev ? { ...prev, importing: false } : prev);
    }
  }

  // ── Product card actions ──
  async function toggleProductStatus(p: SupplierProduct) {
    const next = p.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('products').update({ status: next }).eq('id', p.id);
    if (error) { showToast(`Update failed: ${error.message}`, false); return; }
    showToast(`${p.name} → ${next}`);
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: next } : x));
  }

  const filtered = products.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    (p.category ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // ── Render ──
  const headerColor = supplier?.brand_color ?? '#1a2e5a';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Top bar with both back buttons */}
      <header style={{ backgroundColor: '#060d1f', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '12px 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/supplier')}
            style={{ background: 'transparent', color: '#f4c842', border: '1px solid rgba(244,200,66,0.3)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            ← Suppliers
          </button>
          <button onClick={() => router.push('/dashboard')}
            style={{ background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            ← Dashboard
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>BSC Supplier</div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
        {loading && <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading supplier…</div>}

        {!loading && !supplier && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#dc2626', marginBottom: 12 }}>Supplier not found.</p>
            <Link href="/supplier" style={{ color: '#0a1220', fontWeight: 700, fontSize: 13 }}>← Back to suppliers</Link>
          </div>
        )}

        {!loading && supplier && (
          <>
            {/* Supplier hero */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '18px 22px', marginBottom: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: `6px solid ${headerColor}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: headerColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
                  {supplier.brand_emoji ?? '🏪'}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#060d1f' }}>{supplier.name}</h1>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                    <strong style={{ color: '#475569' }}>{supplier.code}</strong>
                    {' · '}{supplier.supplier_type.replace(/_/g, ' ')}
                    {supplier.contact_name && ' · ' + supplier.contact_name}
                    {supplier.contact_phone && ' · ' + supplier.contact_phone}
                  </p>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, backgroundColor: supplier.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(220,38,38,0.15)', color: supplier.is_active ? '#16a34a' : '#dc2626' }}>
                  {supplier.is_active ? '● Active' : '○ Inactive'}
                </span>
              </div>
            </div>

            {/* Pricelist + Extract actions */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '14px 18px', marginBottom: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {supplier.pricelist_url ? (
                <a href={supplier.pricelist_url} target="_blank" rel="noopener noreferrer"
                  style={{ padding: '7px 12px', borderRadius: 8, backgroundColor: 'rgba(34,197,94,0.12)', color: '#16a34a', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}
                  title={supplier.pricelist_filename ?? ''}>
                  📄 Pricelist · {supplier.pricelist_filename ?? 'open'}
                </a>
              ) : (
                <span style={{ color: '#94a3b8', fontSize: 12 }}>No pricelist uploaded yet.</span>
              )}
              {canEdit && (
                <label style={{ padding: '7px 12px', borderRadius: 8, backgroundColor: 'rgba(245,197,24,0.15)', color: '#a16207', fontSize: 12, fontWeight: 700, cursor: pricelistBusy ? 'wait' : 'pointer', opacity: pricelistBusy ? 0.6 : 1 }}>
                  {pricelistBusy ? '⏳ Uploading…' : supplier.pricelist_url ? '🔁 Replace pricelist' : '📤 Upload pricelist'}
                  <input type="file" accept="application/pdf,image/*" disabled={pricelistBusy} style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPricelist(f); e.currentTarget.value = ''; }} />
                </label>
              )}
              {canEdit && supplier.pricelist_url && (
                <button onClick={startExtract}
                  style={{ padding: '7px 12px', borderRadius: 8, backgroundColor: 'rgba(168,85,247,0.15)', color: '#7c3aed', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  title="Read pricelist with Claude and import as products">
                  🔮 Extract products
                </button>
              )}
              {canEdit && (
                <Link href={`/admin/inventory?supplier=${supplier.id}`}
                  style={{ padding: '7px 12px', borderRadius: 8, backgroundColor: '#f4c842', color: '#060d1f', textDecoration: 'none', fontSize: 12, fontWeight: 800, marginLeft: 'auto' }}>
                  + Add product
                </Link>
              )}
            </div>

            {/* Search */}
            <div style={{ marginBottom: 14 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search products in ${supplier.name}…`}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
              <p style={{ margin: '6px 4px 0', fontSize: 11, color: '#64748b' }}>
                {filtered.length} of {products.length} product{products.length === 1 ? '' : 's'}
              </p>
            </div>

            {/* Product cards grid */}
            {products.length === 0 ? (
              <div style={{ padding: '50px 20px', textAlign: 'center', backgroundColor: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: 14, color: '#475569', marginBottom: 8 }}>No products yet for {supplier.name}.</p>
                {supplier.pricelist_url && (
                  <p style={{ fontSize: 12, color: '#94a3b8' }}>Tap <strong>🔮 Extract products</strong> above to import from the pricelist, or <strong>+ Add product</strong> to add one by hand.</p>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                {filtered.map((p) => {
                  const channels: string[] = [];
                  if (p.sell_nassau)    channels.push('Nas');
                  if (p.sell_andros)    channels.push('And');
                  if (p.sell_online)    channels.push('Onl');
                  if (p.sell_wholesale) channels.push('Whs');
                  const isActive = p.status === 'active';
                  return (
                    <div key={p.id} style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: isActive ? '1px solid #e2e8f0' : '1px dashed #cbd5e1', opacity: isActive ? 1 : 0.7, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ height: 140, background: p.image_url ? `url(${p.image_url}) center/cover` : '#f1f5f9', position: 'relative' }}>
                        <span style={{ position: 'absolute', top: 8, right: 8, padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, backgroundColor: isActive ? 'rgba(22,163,74,0.92)' : 'rgba(100,116,139,0.92)', color: '#fff' }}>
                          {isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>
                      <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#060d1f' }}>{p.name}</h3>
                        <p style={{ margin: '2px 0 8px', fontSize: 10, fontFamily: 'monospace', color: '#94a3b8' }}>
                          {p.sku} · {p.category ?? '—'} · {p.unit_of_measure ?? '—'}{p.pack_size ? ` · ${p.pack_size}` : ''}
                        </p>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                          {channels.length === 0
                            ? <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>No channels enabled</span>
                            : channels.map(c => (
                                <span key={c} style={{ padding: '2px 6px', borderRadius: 4, backgroundColor: '#f1f5f9', color: '#475569', fontSize: 10, fontWeight: 700 }}>{c}</span>
                              ))
                          }
                        </div>
                        <div style={{ marginTop: 'auto', display: 'flex', gap: 6 }}>
                          {canEdit && (
                            <>
                              <button onClick={() => toggleProductStatus(p)}
                                style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', backgroundColor: isActive ? '#fff' : '#f4c842', color: isActive ? '#dc2626' : '#060d1f', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                {isActive ? 'Disable' : 'Enable'}
                              </button>
                              <Link href={`/admin/inventory?product=${p.id}`}
                                style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0a1220', fontSize: 11, fontWeight: 700, textAlign: 'center', textDecoration: 'none' }}>
                                Edit
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Extract modal */}
        {extractModal && supplier && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ width: '100%', maxWidth: 1100, maxHeight: '92vh', backgroundColor: '#0f1a2e', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <h3 style={{ color: '#fff', fontWeight: 900, fontSize: 17, margin: 0 }}>🔮 Extract products — {supplier.name}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, margin: '4px 0 0' }}>Edit any field, untick rows to skip, then tap “Import”.</p>
                </div>
                <button onClick={() => setExtractModal(null)} disabled={extractModal.importing}
                  style={{ background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: extractModal.importing ? 'not-allowed' : 'pointer' }}>
                  Close
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                {extractModal.loading && (
                  <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                    Reading the PDF with Claude — 3–5 seconds…
                  </div>
                )}
                {extractModal.error && (
                  <div style={{ padding: 14, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 13, fontWeight: 600, wordBreak: 'break-word' }}>
                    ⚠️ {extractModal.error}
                  </div>
                )}
                {!extractModal.loading && !extractModal.error && extractModal.products.length === 0 && extractModal.diagnostic && (
                  <div style={{ padding: 16, color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                    <p style={{ color: '#fca5a5', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>No products extracted.</p>
                    <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 12 }}>
                      <div style={{ marginBottom: 8 }}>
                        PDF size: <strong>{(extractModal.diagnostic.pdf_bytes / 1024).toFixed(1)} KB</strong> · Claude returned <strong>{extractModal.diagnostic.raw_products_count}</strong> raw rows.
                      </div>
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 6, fontSize: 11, color: '#cbd5e1', maxHeight: 360, overflow: 'auto' }}>{extractModal.diagnostic.claude_preview || '(empty response)'}</pre>
                    </div>
                  </div>
                )}
                {!extractModal.loading && extractModal.products.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#e2e8f0' }}>
                    <thead>
                      <tr style={{ position: 'sticky', top: 0, backgroundColor: '#0a1220', textAlign: 'left' }}>
                        <th style={{ padding: '8px 6px' }}>Keep</th>
                        <th style={{ padding: '8px 6px' }}>Name</th>
                        <th style={{ padding: '8px 6px' }}>Category</th>
                        <th style={{ padding: '8px 6px' }}>Unit</th>
                        <th style={{ padding: '8px 6px' }}>Pack</th>
                        <th style={{ padding: '8px 6px' }}>Cost $</th>
                        <th style={{ padding: '8px 6px', textAlign: 'center' }}>Nas</th>
                        <th style={{ padding: '8px 6px', textAlign: 'center' }}>And</th>
                        <th style={{ padding: '8px 6px', textAlign: 'center' }}>Onl</th>
                        <th style={{ padding: '8px 6px', textAlign: 'center' }}>Whs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extractModal.products.map((p, i) => (
                        <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', opacity: p.skip ? 0.4 : 1 }}>
                          <td style={{ padding: '6px 6px' }}><input type="checkbox" checked={!p.skip} onChange={e => patchExtractRow(i, { skip: !e.target.checked })} /></td>
                          <td style={{ padding: '6px 6px' }}>
                            <input value={p.name} onChange={e => patchExtractRow(i, { name: e.target.value })}
                              style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12 }} />
                          </td>
                          <td style={{ padding: '6px 6px' }}>
                            <select value={p.category} onChange={e => patchExtractRow(i, { category: e.target.value })}
                              style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#0a1220', color: '#fff', fontSize: 12 }}>
                              {CATEGORIES_FOR_EXTRACT.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '6px 6px' }}>
                            <input value={p.unit_of_measure} onChange={e => patchExtractRow(i, { unit_of_measure: e.target.value })}
                              style={{ width: 70, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12 }} />
                          </td>
                          <td style={{ padding: '6px 6px' }}>
                            <input value={p.pack_size ?? ''} onChange={e => patchExtractRow(i, { pack_size: e.target.value || null })}
                              style={{ width: 90, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12 }} />
                          </td>
                          <td style={{ padding: '6px 6px' }}>
                            <input type="number" step="0.01" value={p.cost_per_unit ?? ''}
                              onChange={e => patchExtractRow(i, { cost_per_unit: e.target.value === '' ? null : Number(e.target.value) })}
                              style={{ width: 80, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, textAlign: 'right' }} />
                          </td>
                          <td style={{ padding: '6px 6px', textAlign: 'center' }}><input type="checkbox" checked={p.sell_nassau} onChange={e => patchExtractRow(i, { sell_nassau: e.target.checked })} /></td>
                          <td style={{ padding: '6px 6px', textAlign: 'center' }}><input type="checkbox" checked={p.sell_andros} onChange={e => patchExtractRow(i, { sell_andros: e.target.checked })} /></td>
                          <td style={{ padding: '6px 6px', textAlign: 'center' }}><input type="checkbox" checked={p.sell_online} onChange={e => patchExtractRow(i, { sell_online: e.target.checked })} /></td>
                          <td style={{ padding: '6px 6px', textAlign: 'center' }}><input type="checkbox" checked={p.sell_wholesale} onChange={e => patchExtractRow(i, { sell_wholesale: e.target.checked })} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
                  {extractModal.products.filter(p => !p.skip).length} of {extractModal.products.length} will be imported
                </div>
                <button onClick={importExtracted}
                  disabled={extractModal.importing || extractModal.loading || extractModal.products.length === 0}
                  style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 900, fontSize: 13, cursor: (extractModal.importing || extractModal.loading) ? 'wait' : 'pointer', opacity: (extractModal.importing || extractModal.loading || extractModal.products.length === 0) ? 0.5 : 1 }}>
                  {extractModal.importing ? 'Importing…' : `✓ Import ${extractModal.products.filter(p => !p.skip).length} products`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', backgroundColor: toast.ok ? '#16a34a' : '#dc2626', zIndex: 80, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
            {toast.msg}
          </div>
        )}
      </main>
    </div>
  );
}
