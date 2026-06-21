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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { canLock, useUserRole } from '@/lib/role';
import { useServerSave } from '@/lib/useServerSave';
import { SaveButton } from '@/components/SaveButton';

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
  operating_cost_accepted: boolean;
  pricelist_url: string | null;
  pricelist_filename: string | null;
  pricelist_uploaded_at: string | null;
}

interface SupplierProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  unit_of_measure: string | null;
  pack_size: string | null;
  status: string;
  image_url: string | null;
  vat_code: 'X' | 'T' | 'F' | null;          // X=0%  T=10%  F=5%
  sell_nassau: boolean;
  sell_andros: boolean;
  sell_online: boolean;
  sell_wholesale: boolean;
  cost_per_unit: number | null;              // current cost from product_costs join
  retail_margin_pct: number;                  // current online_market margin (default 35)
  wholesale_margin_pct: number;               // current local_wholesale margin (default 15)
}
type RowSaveState = 'idle' | 'saving' | 'saved' | 'error';

// VAT rate lookup. F = 5% (added 2026-06-07 for BWA diapers/wipes/pads).
function vatRateFor(code: SupplierProduct['vat_code']): number {
  if (code === 'T') return 0.10;
  if (code === 'F') return 0.05;
  return 0; // X or null
}

// Customer-price preview (VAT-inclusive). This catalog is taxable.
// Formula:
//   base = (cost × (1 + margin/100)) / 0.96    (4% bank-charge gross-up)
//   customer_price = base × (1 + vatRate)
function customerPriceFor(cost: number | null, marginPct: number, code: SupplierProduct['vat_code']): number | null {
  if (cost == null || cost <= 0) return null;
  if (!Number.isFinite(marginPct) || marginPct < 0) return null;
  const base = (cost * (1 + marginPct / 100)) / 0.96;
  return base * (1 + vatRateFor(code));
}

const DEFAULT_RETAIL_MARGIN = 35;
const DEFAULT_WHOLESALE_MARGIN = 15;

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
  image_url: string;
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

// Shared input/select styling for the inline inventory table cells.
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 7px',
  borderRadius: 5,
  border: '1px solid rgba(255,255,255,0.10)',
  backgroundColor: 'rgba(255,255,255,0.04)',
  color: '#fff',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
};
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  backgroundColor: '#0a1220',
};

interface ProductEditForm {
  name:            string;
  category:        string;
  unit_of_measure: string;
  pack_size:       string;
  image_url:       string;
  sell_nassau:     boolean;
  sell_andros:     boolean;
  sell_online:     boolean;
  sell_wholesale:  boolean;
  status:          string;
}

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
  const [page,      setPage]      = useState(0);   // product-grid pagination (PAGE_SIZE per page)
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [pricelistBusy, setPricelistBusy] = useState(false);
  const [extractModal, setExtractModal] = useState<null | {
    loading: boolean; error: string | null; products: ExtractedProduct[];
    importing: boolean; diagnostic: ExtractDiagnostic | null; progress?: string | null;
  }>(null);
  // Universal server-authoritative Save — persists the reviewed extract set to a
  // durable draft so edits survive closing the modal (D2 / Phase 5).
  const { save: saveDraft, state: draftState } = useServerSave('/api/supplier/save-extract-draft');
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Full-screen product editor — opens when you tap a product card
  const [editingProduct, setEditingProduct] = useState<SupplierProduct | null>(null);
  const [editForm, setEditForm] = useState<ProductEditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editImgUploading, setEditImgUploading] = useState(false);

  // Inline-save state per row (id → state). 'saved' clears itself after 2s.
  const [rowState, setRowState] = useState<Record<string, RowSaveState>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowImgBusy, setRowImgBusy] = useState<Record<string, boolean>>({});

  function setRowStatus(id: string, state: RowSaveState, err?: string) {
    setRowState(prev => ({ ...prev, [id]: state }));
    setRowError(prev => {
      const next = { ...prev };
      if (state === 'error' && err) next[id] = err; else delete next[id];
      return next;
    });
    if (state === 'saved') {
      setTimeout(() => setRowState(prev => prev[id] === 'saved' ? { ...prev, [id]: 'idle' } : prev), 2000);
    }
  }

  // PATCH the product. Accepts a partial — only changed fields go in body.
  async function patchProduct(id: string, patch: Record<string, unknown>) {
    setRowStatus(id, 'saving');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setRowStatus(id, 'error', 'Sign-in expired'); return; }
      const res = await fetch(`/api/admin/products/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(patch),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setRowStatus(id, 'error', j.error || `HTTP ${res.status}`); return; }
      setRowStatus(id, 'saved');
    } catch (e) {
      setRowStatus(id, 'error', e instanceof Error ? e.message : 'save failed');
    }
  }

  // Update a single field in local state immediately (optimistic) and
  // PATCH the server. For text/numeric fields, callers should fire this
  // on blur so we're not PATCH-ing every keystroke.
  function patchField<K extends keyof SupplierProduct>(id: string, field: K, value: SupplierProduct[K]) {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    patchProduct(id, { [field]: value });
  }

  // Per-channel margin save. PATCH /api/admin/products/[id] accepts
  // { channel_margins: { online_market: 35 } } as PERCENT and routes it
  // through bsc_set_channel_price which keeps margin_multiplier + price
  // in sync atomically.
  function patchChannelMargin(productId: string, channel: 'online_market' | 'local_wholesale', pct: number) {
    const localField: keyof SupplierProduct = channel === 'online_market' ? 'retail_margin_pct' : 'wholesale_margin_pct';
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, [localField]: pct } : p));
    patchProduct(productId, { channel_margins: { [channel]: pct } });
  }

  async function uploadRowImage(p: SupplierProduct, file: File) {
    setRowImgBusy(prev => ({ ...prev, [p.id]: true }));
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg';
      const path = `products/${p.sku}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('site-images')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) { setRowStatus(p.id, 'error', `image: ${upErr.message}`); return; }
      const { data: pub } = supabase.storage.from('site-images').getPublicUrl(path);
      patchField(p.id, 'image_url', pub.publicUrl);
    } finally {
      setRowImgBusy(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    }
  }

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    // try/finally so a failed query can NEVER strand the page on "Loading
    // supplier…" (the white-screen bug). finally always clears loading.
    try {
      const { data: sup } = await supabase.from('suppliers').select('*').eq('id', id).maybeSingle();
      setSupplier(sup as Supplier | null);
      // Fetch products + costs + per-channel margins. Embedded joins were
      // unreliable so we run three queries and stitch client-side.
      type ProductRow = {
        id: string; sku: string; name: string; description: string | null;
        category: string | null; unit_of_measure: string | null; pack_size: string | null;
        status: string; image_url: string | null; vat_code: 'X'|'T'|'F'|null;
        sell_nassau: boolean; sell_andros: boolean; sell_online: boolean; sell_wholesale: boolean;
      };
      const { data: prods, error: prodErr } = await supabase
        .from('products')
        .select('id, sku, name, description, category, unit_of_measure, pack_size, status, image_url, vat_code, sell_nassau, sell_andros, sell_online, sell_wholesale')
        .eq('primary_supplier_id', id)
        .order('name');
      if (prodErr) {
        showToast(`Load products failed: ${prodErr.message}`, false);
      }
      const productList = (prods ?? []) as ProductRow[];
      const costMap:   Record<string, number | null> = {};
      const retailMap: Record<string, number>        = {};
      const wholeMap:  Record<string, number>        = {};
      // Chunk the id-set so .in() never builds an oversized request URL — a
      // ~1,800-product supplier would otherwise blow the URL limit and throw.
      const ids = productList.map((p) => p.id);
      const ID_CHUNK = 100;
      for (let k = 0; k < ids.length; k += ID_CHUNK) {
        const slice = ids.slice(k, k + ID_CHUNK);
        const [{ data: costs }, { data: pricing }] = await Promise.all([
          supabase.from('product_costs')
            .select('product_id, cost_per_unit')
            .in('product_id', slice).eq('is_current', true),
          supabase.from('product_pricing')
            .select('product_id, channel, margin_multiplier')
            .in('product_id', slice).eq('is_current', true)
            .in('channel', ['online_market', 'local_wholesale']),
        ]);
        for (const c of ((costs ?? []) as Array<{ product_id: string; cost_per_unit: number | null }>)) {
          costMap[c.product_id] = c.cost_per_unit != null ? Number(c.cost_per_unit) : null;
        }
        for (const row of ((pricing ?? []) as Array<{ product_id: string; channel: string; margin_multiplier: number | null }>)) {
          const pct = row.margin_multiplier != null ? Math.round((Number(row.margin_multiplier) - 1) * 10000) / 100 : NaN;
          if (!Number.isFinite(pct)) continue;
          if (row.channel === 'online_market')   retailMap[row.product_id] = pct;
          if (row.channel === 'local_wholesale') wholeMap[row.product_id]  = pct;
        }
      }
      setProducts(productList.map((p) => ({
        ...p,
        cost_per_unit:        costMap[p.id]   ?? null,
        retail_margin_pct:    retailMap[p.id] ?? DEFAULT_RETAIL_MARGIN,
        wholesale_margin_pct: wholeMap[p.id]  ?? DEFAULT_WHOLESALE_MARGIN,
      })));
    } catch (e) {
      showToast(`Load failed: ${e instanceof Error ? e.message : 'unknown'}`, false);
    } finally {
      setLoading(false);
    }
  }, [id, supabase]);

  useEffect(() => { load(); }, [load]);

  // Debounced auto-save: every edit to the reviewed extract rows is captured to
  // the durable draft 1.5s after typing stops — so closing the modal never
  // loses work. The explicit Save button below the grid does the same on demand.
  useEffect(() => {
    const rows = extractModal?.products;
    if (!supplier || !extractModal || extractModal.loading || !rows || rows.length === 0) return;
    const supplierId = supplier.id;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => { void saveDraft({ supplier_id: supplierId, rows }); }, 1500);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [extractModal?.products, extractModal?.loading, supplier, saveDraft]);

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

  // ── Gate 1: "Supplier Approved" toggle (D3a) ──
  // Writes suppliers.operating_cost_accepted ONLY. Boolean flip — there is
  // intentionally NO ×0.93 auto-intake side effect here (that belongs to the
  // deferred product-management flow). Mirrors the client-side update pattern
  // used by uploadPricelist; server-authoritative hardening is deferred to
  // Phase 5 per docs/DECISIONS.md (D2).
  async function toggleOperatingCost() {
    if (!supplier) return;
    const next = !supplier.operating_cost_accepted;
    const { error } = await supabase.from('suppliers')
      .update({ operating_cost_accepted: next, updated_at: new Date().toISOString() })
      .eq('id', supplier.id);
    if (error) { showToast(`Update failed: ${error.message}`, false); return; }
    showToast(next ? '✅ Supplier Approved' : '○ Supplier set to Not Approved');
    await load();
  }

  // ── Chunked extraction: follow the route's next_start_page cursor ──
  // Calls /api/supplier/extract-pricelist starting at page 0 and keeps going
  // (start_page = next_start_page) until the route reports next_start_page=null,
  // accumulating every page's rows into one array and de-duping by
  // suggested_sku (fallback raw_line) against page-boundary overlap. Reports
  // "Extracting… N products · page X of Y" via onProgress. Hard-guarded by a
  // 100-iteration cap and a non-advancing-cursor stop so it can never spin.
  async function extractAllPages(
    token: string,
    onProgress?: (msg: string) => void,
  ): Promise<{ ok: true; products: ExtractedProduct[]; diagnostic: ExtractDiagnostic | null }
          | { ok: false; error: string }> {
    if (!supplier) return { ok: false, error: 'No supplier loaded.' };
    const all: ExtractedProduct[] = [];
    const seen = new Set<string>();
    let firstDiagnostic: ExtractDiagnostic | null = null;
    let startPage = 0;
    const MAX_ITERS = 100;
    for (let iter = 0; iter < MAX_ITERS; iter++) {
      const res = await fetch('/api/supplier/extract-pricelist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ supplier_id: supplier.id, start_page: startPage }),
        cache:   'no-store',
      });
      const rawBody = await res.text();
      let j: {
        ok?: boolean; error?: string; products?: ExtractedProduct[];
        diagnostic?: ExtractDiagnostic | null; next_start_page?: number | null; total_pages?: number;
      };
      try { j = JSON.parse(rawBody); }
      catch { return { ok: false, error: `HTTP ${res.status} · non-JSON (first 400 chars): ${rawBody.slice(0, 400)}` }; }
      if (!res.ok || !j.ok) return { ok: false, error: j.error || `HTTP ${res.status}` };
      if (iter === 0) firstDiagnostic = (j.diagnostic ?? null) as ExtractDiagnostic | null;

      for (const p of (j.products ?? [])) {
        const key = (p.suggested_sku || p.raw_line || '').toLowerCase();
        if (key && seen.has(key)) continue; // defensive client-side dedupe (page-boundary overlap)
        if (key) seen.add(key);
        all.push(p);
      }

      const next  = j.next_start_page;
      const total = j.total_pages;
      if (onProgress) {
        const pageLabel = total != null
          ? ` · page ${Math.min(typeof next === 'number' ? next : total, total)} of ${total}`
          : '';
        onProgress(`Extracting… ${all.length} products${pageLabel}`);
      }

      if (next == null) break;                                   // all pages done
      if (typeof next !== 'number' || next <= startPage) break;  // cursor not advancing → stop
      startPage = next;
    }
    return { ok: true, products: all, diagnostic: all.length === 0 ? firstDiagnostic : null };
  }

  // One-tap: extract + auto-import every row. No review modal — useful
  // when the founder trusts the extraction and just wants the products
  // landed (skip on the JBI/Lightbourn/BWA wholesale partners where the
  // pricelist columns are stable).
  const [autoImportBusy, setAutoImportBusy] = useState(false);
  const [autoImportMsg,  setAutoImportMsg]  = useState<string | null>(null);
  async function extractAndImportAll() {
    if (!supplier) return;
    if (!confirm(`Extract products from ${supplier.name}'s pricelist and import EVERY row with no review?\n\nIf you want to review/edit first, tap "🔮 Extract products" instead.`)) return;
    setAutoImportBusy(true);
    setAutoImportMsg('Reading pricelist with Claude…');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setAutoImportMsg('Sign-in expired — refresh.'); return; }

      // Step 1: extract ALL pages (chunked — follows the next_start_page cursor).
      const ex = await extractAllPages(token, setAutoImportMsg);
      if (!ex.ok) {
        setAutoImportMsg(`Extract failed: ${ex.error}`);
        return;
      }
      const extracted = ex.products;
      if (extracted.length === 0) {
        setAutoImportMsg('Claude returned 0 products. Open the review modal to see why.');
        return;
      }
      // Drop rows with no cost — they can't be priced.
      const rows = extracted.filter(p => p.cost_per_unit != null && p.cost_per_unit > 0);
      if (rows.length === 0) {
        setAutoImportMsg(`Extracted ${extracted.length} rows but none had a usable cost. Open the review modal to fix.`);
        return;
      }
      setAutoImportMsg(`Importing ${rows.length} of ${extracted.length} extracted products…`);
      const isWP = supplier.supplier_type === 'wholesale_partner';

      // Step 2: bulk import
      const imRes = await fetch('/api/supplier/bulk-add-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          supplier_id: supplier.id,
          rows: rows.map(p => ({
            sku:             p.suggested_sku,
            name:            p.name,
            category:        p.suggested_category,
            unit_of_measure: p.unit_of_measure,
            pack_size:       p.pack_size,
            cost_per_unit:   p.cost_per_unit,
            image_url:       null,
            channels: { nassau: true, andros: false, online: false, wholesale: isWP },
          })),
        }),
      });
      const im = await imRes.json();
      if (!imRes.ok || !im.ok) {
        setAutoImportMsg(`Import failed: ${im.error || `HTTP ${imRes.status}`}`);
        return;
      }
      const failedN = (im.failed ?? []).length;
      setAutoImportMsg(`📦 Imported ${im.inserted}${failedN ? ` · ${failedN} failed` : ''}.`);
      await load();
    } catch (e) {
      setAutoImportMsg(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setAutoImportBusy(false);
    }
  }

  // ── Open the extract modal: resume the saved draft if one exists, else do a
  //    fresh Claude extraction. Resuming is what makes edits survive a close. ──
  async function startExtract() {
    if (!supplier) return;
    setExtractModal({ loading: true, error: null, products: [], importing: false, diagnostic: null, progress: 'Loading…' });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setExtractModal({ loading: false, error: 'Sign-in expired — refresh.', products: [], importing: false, diagnostic: null });
        return;
      }
      // Resume a saved draft if present — reviewed edits survive modal close.
      try {
        const dRes = await fetch(`/api/supplier/save-extract-draft?supplier_id=${supplier.id}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
        });
        const d = (await dRes.json().catch(() => ({}))) as { ok?: boolean; rows?: unknown };
        if (dRes.ok && d.ok && Array.isArray(d.rows) && d.rows.length > 0) {
          setExtractModal({ loading: false, error: null, products: d.rows as ExtractedProduct[], importing: false, diagnostic: null });
          showToast(`Resumed ${d.rows.length} saved row${d.rows.length === 1 ? '' : 's'} — tap 🔄 Re-extract for a fresh read.`);
          return;
        }
      } catch { /* no draft → fresh extract below */ }
      await runFreshExtract(token);
    } catch (e) {
      setExtractModal({
        loading: false, error: e instanceof Error ? e.message : 'Extract failed',
        products: [], importing: false, diagnostic: null,
      });
    }
  }

  // Fresh Claude extraction of the uploaded pricelist (first open + Re-extract).
  async function runFreshExtract(token: string) {
    if (!supplier) return;
    setExtractModal({ loading: true, error: null, products: [], importing: false, diagnostic: null, progress: 'Reading the PDF with Claude…' });
    const ex = await extractAllPages(token, (msg) =>
      setExtractModal(prev => prev ? { ...prev, progress: msg } : prev));
    if (!ex.ok) {
      setExtractModal({ loading: false, error: ex.error, products: [], importing: false, diagnostic: null });
      return;
    }
    const isWP = supplier.supplier_type === 'wholesale_partner';
    const rows: ExtractedProduct[] = ex.products.map((p) => ({
      ...p,
      sku:           p.suggested_sku,
      category:      p.suggested_category,
      skip:          p.cost_per_unit == null,
      image_url:     '',
      sell_nassau:   true,
      sell_andros:   false,
      sell_online:   false,
      sell_wholesale: isWP,
    }));
    setExtractModal({ loading: false, error: null, products: rows, importing: false, diagnostic: ex.diagnostic });
  }

  async function reExtract() {
    if (!supplier) return;
    if (!confirm('Re-read the pricelist with Claude? This replaces the current reviewed rows in the modal.')) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { showToast('Sign-in expired — refresh.', false); return; }
    await runFreshExtract(token);
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
            image_url: p.image_url || null,
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
      void saveDraft({ supplier_id: supplier.id, rows: [] }); // drain the draft now it's imported
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

  function openProductEditor(p: SupplierProduct) {
    setEditingProduct(p);
    setEditForm({
      name:            p.name,
      category:        p.category ?? '',
      unit_of_measure: p.unit_of_measure ?? '',
      pack_size:       p.pack_size ?? '',
      image_url:       p.image_url ?? '',
      sell_nassau:     p.sell_nassau,
      sell_andros:     p.sell_andros,
      sell_online:     p.sell_online,
      sell_wholesale:  p.sell_wholesale,
      status:          p.status,
    });
  }

  function closeProductEditor() {
    setEditingProduct(null);
    setEditForm(null);
    setEditSaving(false);
    setEditImgUploading(false);
  }

  async function uploadProductImage(file: File) {
    if (!editingProduct || !editForm) return;
    setEditImgUploading(true);
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg';
      const path = `products/${editingProduct.sku}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('site-images')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) { showToast(`Image upload failed: ${upErr.message}`, false); return; }
      const { data: pub } = supabase.storage.from('site-images').getPublicUrl(path);
      setEditForm({ ...editForm, image_url: pub.publicUrl });
      showToast('📷 Image uploaded — tap Save to apply');
    } finally {
      setEditImgUploading(false);
    }
  }

  async function saveProduct() {
    if (!editingProduct || !editForm) return;
    setEditSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { showToast('Sign-in expired — refresh.', false); return; }
      const res = await fetch(`/api/admin/products/${editingProduct.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name:            editForm.name,
          category:        editForm.category || null,
          unit_of_measure: editForm.unit_of_measure || null,
          pack_size:       editForm.pack_size || null,
          image_url:       editForm.image_url || null,
          sell_nassau:     editForm.sell_nassau,
          sell_andros:     editForm.sell_andros,
          sell_online:     editForm.sell_online,
          sell_wholesale:  editForm.sell_wholesale,
          status:          editForm.status,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { showToast(`Save failed: ${j.error || `HTTP ${res.status}`}`, false); return; }
      showToast(`✓ ${editForm.name} saved`);
      // Reflect locally so the grid updates without a full reload.
      setProducts(prev => prev.map(x => x.id === editingProduct.id ? {
        ...x,
        name:            editForm.name,
        category:        editForm.category || null,
        unit_of_measure: editForm.unit_of_measure || null,
        pack_size:       editForm.pack_size || null,
        image_url:       editForm.image_url || null,
        sell_nassau:     editForm.sell_nassau,
        sell_andros:     editForm.sell_andros,
        sell_online:     editForm.sell_online,
        sell_wholesale:  editForm.sell_wholesale,
        status:          editForm.status,
      } : x));
      closeProductEditor();
    } finally {
      setEditSaving(false);
    }
  }

  const filtered = products.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    (p.category ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Paginate the grid so a supplier with hundreds/thousands of products doesn't
  // render every editable row at once (DOM blow-up / freeze).
  const PAGE_SIZE = 100;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage  = Math.min(Math.max(page, 0), pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

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
                {/* Gate 1 — Supplier Approved switch (founder/co_founder only).
                    Writes operating_cost_accepted; no ×0.93 intake side effect. */}
                {canEdit && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={supplier.operating_cost_accepted}
                      onClick={() => toggleOperatingCost()}
                      title={supplier.operating_cost_accepted
                        ? 'Supplier Approved — ×0.93 landed cost applies on future intake'
                        : 'Not Approved — supplier quotes used as-is'}
                      style={{ position: 'relative', width: 50, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer', backgroundColor: supplier.operating_cost_accepted ? '#16a34a' : '#cbd5e1', transition: 'background-color 0.15s', flexShrink: 0, padding: 0 }}>
                      <span style={{ position: 'absolute', top: 4, left: supplier.operating_cost_accepted ? 26 : 4, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                    </button>
                    <span style={{ fontSize: 11, fontWeight: 700, color: supplier.operating_cost_accepted ? '#16a34a' : '#64748b', whiteSpace: 'nowrap' }}>
                      {supplier.operating_cost_accepted ? 'Supplier Approved' : 'Not Approved'}
                    </span>
                  </div>
                )}
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
                  title="Read pricelist with Claude and review each row before importing">
                  🔮 Extract products
                </button>
              )}
              {canEdit && supplier.pricelist_url && (
                <button onClick={extractAndImportAll} disabled={autoImportBusy}
                  style={{ padding: '7px 12px', borderRadius: 8, backgroundColor: 'rgba(34,197,94,0.18)', color: '#15803d', border: 'none', fontSize: 12, fontWeight: 800, cursor: autoImportBusy ? 'wait' : 'pointer', opacity: autoImportBusy ? 0.6 : 1 }}
                  title="Extract pricelist with Claude AND import every priced row, no review">
                  {autoImportBusy ? '⏳ Importing…' : '🚀 Extract & import all'}
                </button>
              )}
              {canEdit && (
                <Link href={`/admin/inventory?supplier=${supplier.id}`}
                  style={{ padding: '7px 12px', borderRadius: 8, backgroundColor: '#f4c842', color: '#060d1f', textDecoration: 'none', fontSize: 12, fontWeight: 800, marginLeft: 'auto' }}>
                  + Add product
                </Link>
              )}
            </div>

            {/* Auto-import status banner */}
            {autoImportMsg && (
              <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, backgroundColor: autoImportMsg.startsWith('📦') ? 'rgba(34,197,94,0.12)' : autoImportMsg.includes('failed') || autoImportMsg.includes('Sign-in') ? 'rgba(239,68,68,0.10)' : 'rgba(168,85,247,0.10)', color: autoImportMsg.startsWith('📦') ? '#15803d' : autoImportMsg.includes('failed') || autoImportMsg.includes('Sign-in') ? '#b91c1c' : '#6d28d9', fontSize: 13, fontWeight: 700 }}>
                {autoImportMsg}
              </div>
            )}

            {/* Search */}
            <div style={{ marginBottom: 14 }}>
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder={`Search products in ${supplier.name}…`}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '6px 4px 0' }}>
                <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
                  {filtered.length} of {products.length} product{products.length === 1 ? '' : 's'}
                  {pageCount > 1 && ` · showing ${safePage * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE + PAGE_SIZE, filtered.length)}`}
                </p>
                {pageCount > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage <= 0}
                      style={{ background: 'transparent', color: '#0a1220', border: '1px solid #cbd5e1', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: safePage <= 0 ? 'not-allowed' : 'pointer', opacity: safePage <= 0 ? 0.4 : 1 }}>
                      ← Prev
                    </button>
                    <span style={{ fontSize: 11, color: '#475569' }}>Page {safePage + 1} / {pageCount}</span>
                    <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}
                      style={{ background: 'transparent', color: '#0a1220', border: '1px solid #cbd5e1', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: safePage >= pageCount - 1 ? 'not-allowed' : 'pointer', opacity: safePage >= pageCount - 1 ? 0.4 : 1 }}>
                      Next →
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Inline-editable inventory table — auto-saves on blur. */}
            {products.length === 0 ? (
              <div style={{ padding: '50px 20px', textAlign: 'center', backgroundColor: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: 14, color: '#475569', marginBottom: 8 }}>No products yet for {supplier.name}.</p>
                {supplier.pricelist_url && (
                  <p style={{ fontSize: 12, color: '#94a3b8' }}>Tap <strong>🔮 Extract products</strong> above to import from the pricelist, or <strong>+ Add product</strong> to add one by hand.</p>
                )}
              </div>
            ) : (
              <div style={{ backgroundColor: '#0f1a2e', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#e2e8f0', minWidth: 1600 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0a1220', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <th style={{ padding: '10px 8px', width: 44 }}>Live</th>
                        <th style={{ padding: '10px 8px', minWidth: 180 }}>Name</th>
                        <th style={{ padding: '10px 8px', minWidth: 200 }}>Description</th>
                        <th style={{ padding: '10px 8px', minWidth: 130 }}>Category</th>
                        <th style={{ padding: '10px 8px', width: 80 }}>Unit</th>
                        <th style={{ padding: '10px 8px', width: 100 }}>Pack</th>
                        <th style={{ padding: '10px 8px', width: 90 }}>Cost $</th>
                        <th style={{ padding: '10px 8px', width: 80 }}>VAT</th>
                        <th style={{ padding: '10px 8px', width: 80, textAlign: 'right' }}>Retail %</th>
                        <th style={{ padding: '10px 8px', width: 90, textAlign: 'right', color: '#86efac' }}>Retail $</th>
                        <th style={{ padding: '10px 8px', width: 80, textAlign: 'right' }}>Whsl %</th>
                        <th style={{ padding: '10px 8px', width: 90, textAlign: 'right', color: '#86efac' }}>Whsl $</th>
                        <th style={{ padding: '10px 8px', minWidth: 220 }}>Image</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', width: 46 }}>Nas</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', width: 46 }}>And</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', width: 46 }}>Onl</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', width: 46 }}>Whs</th>
                        <th style={{ padding: '10px 8px', width: 80, textAlign: 'right' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((p) => {
                        const isActive = p.status === 'active';
                        const state    = rowState[p.id] ?? 'idle';
                        const err      = rowError[p.id];
                        const imgBusy  = !!rowImgBusy[p.id];
                        const rowBg    = state === 'error' ? 'rgba(220,38,38,0.08)' : state === 'saved' ? 'rgba(34,197,94,0.06)' : 'transparent';
                        return (
                          <tr key={p.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', backgroundColor: rowBg, opacity: isActive ? 1 : 0.55 }}>
                            <td style={{ padding: '6px 8px' }}>
                              <input type="checkbox" checked={isActive}
                                onChange={(e) => patchField(p.id, 'status', e.target.checked ? 'active' : 'inactive' as never)} />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                defaultValue={p.name}
                                onBlur={(e) => { if (e.target.value !== p.name) patchField(p.id, 'name', e.target.value); }}
                                style={inputStyle} />
                              <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{p.sku}</div>
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                defaultValue={p.description ?? ''}
                                placeholder="Short customer-facing line"
                                onBlur={(e) => { if (e.target.value !== (p.description ?? '')) patchField(p.id, 'description', e.target.value || null); }}
                                style={inputStyle} />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <select value={p.category ?? ''}
                                onChange={(e) => patchField(p.id, 'category', e.target.value || null)}
                                style={selectStyle}>
                                <option value="">—</option>
                                {CATEGORIES_FOR_EXTRACT.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                defaultValue={p.unit_of_measure ?? ''}
                                onBlur={(e) => { if (e.target.value !== (p.unit_of_measure ?? '')) patchField(p.id, 'unit_of_measure', e.target.value || null); }}
                                style={inputStyle} />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                defaultValue={p.pack_size ?? ''}
                                onBlur={(e) => { if (e.target.value !== (p.pack_size ?? '')) patchField(p.id, 'pack_size', e.target.value || null); }}
                                style={inputStyle} />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input type="number" step="0.01" inputMode="decimal"
                                defaultValue={p.cost_per_unit ?? ''}
                                onBlur={(e) => {
                                  const next = e.target.value === '' ? null : Number(e.target.value);
                                  if (next != null && next !== p.cost_per_unit && next > 0) {
                                    // Cost change inserts a new product_costs row server-side.
                                    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, cost_per_unit: next } : x));
                                    patchProduct(p.id, { cost_per_unit: next });
                                    // Re-fire both channel margins so the PERSISTED channel
                                    // price recomputes off the new cost. Without this, the
                                    // preview updates but product_pricing.manual_unit_price
                                    // would still reflect the OLD cost until the founder
                                    // touched a margin cell. Re-uses the same RPC path.
                                    patchChannelMargin(p.id, 'online_market',   p.retail_margin_pct);
                                    patchChannelMargin(p.id, 'local_wholesale', p.wholesale_margin_pct);
                                  }
                                }}
                                style={{ ...inputStyle, textAlign: 'right' }} />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <select value={p.vat_code ?? 'X'}
                                onChange={(e) => patchField(p.id, 'vat_code', e.target.value as SupplierProduct['vat_code'])}
                                style={selectStyle}>
                                <option value="X">Free (0%)</option>
                                <option value="T">10%</option>
                                <option value="F">5%</option>
                              </select>
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input type="number" step="0.1" inputMode="decimal"
                                defaultValue={p.retail_margin_pct}
                                onBlur={(e) => {
                                  const next = Number(e.target.value);
                                  if (Number.isFinite(next) && next >= 0 && next !== p.retail_margin_pct) {
                                    patchChannelMargin(p.id, 'online_market', next);
                                  }
                                }}
                                style={{ ...inputStyle, textAlign: 'right' }} />
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#86efac', fontFamily: 'monospace', fontWeight: 700 }}>
                              {(() => {
                                const px = customerPriceFor(p.cost_per_unit, p.retail_margin_pct, p.vat_code);
                                return px != null ? `$${px.toFixed(2)}` : '—';
                              })()}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input type="number" step="0.1" inputMode="decimal"
                                defaultValue={p.wholesale_margin_pct}
                                onBlur={(e) => {
                                  const next = Number(e.target.value);
                                  if (Number.isFinite(next) && next >= 0 && next !== p.wholesale_margin_pct) {
                                    patchChannelMargin(p.id, 'local_wholesale', next);
                                  }
                                }}
                                style={{ ...inputStyle, textAlign: 'right' }} />
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#86efac', fontFamily: 'monospace', fontWeight: 700 }}>
                              {(() => {
                                const px = customerPriceFor(p.cost_per_unit, p.wholesale_margin_pct, p.vat_code);
                                return px != null ? `$${px.toFixed(2)}` : '—';
                              })()}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input
                                  defaultValue={p.image_url ?? ''}
                                  placeholder="https://… or use 📷"
                                  onBlur={(e) => { if (e.target.value !== (p.image_url ?? '')) patchField(p.id, 'image_url', e.target.value || null); }}
                                  style={{ ...inputStyle, flex: 1 }} />
                                <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 26, borderRadius: 6, backgroundColor: '#f4c842', color: '#060d1f', fontSize: 13, fontWeight: 800, cursor: imgBusy ? 'wait' : 'pointer', opacity: imgBusy ? 0.6 : 1 }}>
                                  {imgBusy ? '⏳' : '📷'}
                                  <input type="file" accept="image/*" disabled={imgBusy} style={{ display: 'none' }}
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRowImage(p, f); e.currentTarget.value = ''; }} />
                                </label>
                                {p.image_url && (
                                  <a href={p.image_url} target="_blank" rel="noopener noreferrer"
                                    title="Open image" style={{ color: '#86efac', textDecoration: 'none', fontSize: 14 }}>↗</a>
                                )}
                              </div>
                            </td>
                            {(['sell_nassau','sell_andros','sell_online','sell_wholesale'] as const).map(ch => (
                              <td key={ch} style={{ padding: '6px 8px', textAlign: 'center' }}>
                                <input type="checkbox" checked={p[ch]}
                                  onChange={(e) => patchField(p.id, ch, e.target.checked)} />
                              </td>
                            ))}
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                              {state === 'saving' && <span style={{ fontSize: 10, color: '#fbbf24' }}>saving…</span>}
                              {state === 'saved'  && <span style={{ fontSize: 10, color: '#4ade80' }}>✓ saved</span>}
                              {state === 'error'  && <span title={err} style={{ fontSize: 10, color: '#fca5a5', fontWeight: 700 }}>⚠ err</span>}
                              {state === 'idle'   && (
                                <button onClick={() => openProductEditor(p)}
                                  style={{ background: 'transparent', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                  ✏️ More
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {Object.values(rowError).length > 0 && (
                  <div style={{ padding: '10px 14px', backgroundColor: 'rgba(220,38,38,0.10)', borderTop: '1px solid rgba(220,38,38,0.25)', fontSize: 11, color: '#fca5a5' }}>
                    {Object.entries(rowError).map(([id, e]) => {
                      const prod = products.find(p => p.id === id);
                      return <div key={id}><strong>{prod?.name ?? id.slice(0,8)}:</strong> {e}</div>;
                    })}
                  </div>
                )}
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
                    {extractModal.progress ?? 'Reading the PDF with Claude — 3–5 seconds…'}
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
                        <th style={{ padding: '8px 6px' }}>Image URL (optional)</th>
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
                          <td style={{ padding: '6px 6px' }}>
                            <input value={p.image_url} placeholder="https://…"
                              onChange={e => patchExtractRow(i, { image_url: e.target.value })}
                              style={{ width: 180, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 11 }} />
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
              <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
                  {extractModal.products.filter(p => !p.skip).length} of {extractModal.products.length} will be imported
                  {draftState === 'saving' && <span style={{ color: '#fbbf24', marginLeft: 8 }}>· saving draft…</span>}
                  {draftState === 'saved'  && <span style={{ color: '#4ade80', marginLeft: 8 }}>· draft saved ✓</span>}
                  {draftState === 'error'  && <span style={{ color: '#fca5a5', marginLeft: 8 }}>· draft save failed</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {supplier.pricelist_url && (
                    <button onClick={reExtract} disabled={extractModal.loading || extractModal.importing}
                      style={{ background: 'transparent', color: '#c084fc', border: '1px solid rgba(168,85,247,0.4)', borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 700, cursor: (extractModal.loading || extractModal.importing) ? 'not-allowed' : 'pointer', opacity: (extractModal.loading || extractModal.importing) ? 0.5 : 1 }}>
                      🔄 Re-extract
                    </button>
                  )}
                  <SaveButton state={draftState} label="💾 Save draft"
                    disabled={extractModal.loading || extractModal.importing || extractModal.products.length === 0}
                    onClick={() => { if (supplier) void saveDraft({ supplier_id: supplier.id, rows: extractModal.products }); }} />
                  <button onClick={importExtracted}
                    disabled={extractModal.importing || extractModal.loading || extractModal.products.length === 0}
                    style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 900, fontSize: 13, cursor: (extractModal.importing || extractModal.loading) ? 'wait' : 'pointer', opacity: (extractModal.importing || extractModal.loading || extractModal.products.length === 0) ? 0.5 : 1 }}>
                    {extractModal.importing ? 'Importing…' : `✓ Import ${extractModal.products.filter(p => !p.skip).length} products`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PRODUCT EDITOR MODAL — full screen ── */}
        {editingProduct && editForm && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(6,13,31,0.92)', zIndex: 80, overflow: 'auto' }}>
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
              {/* Editor top bar */}
              <header style={{ backgroundColor: '#060d1f', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 1 }}>
                <button onClick={closeProductEditor} disabled={editSaving}
                  style={{ background: 'transparent', color: '#f4c842', border: '1px solid rgba(244,200,66,0.3)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: editSaving ? 'wait' : 'pointer' }}>
                  ← Back
                </button>
                <div style={{ flex: 1, color: '#fff', fontWeight: 800, fontSize: 14 }}>
                  Manage product
                </div>
                <button onClick={saveProduct} disabled={editSaving}
                  style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 10, padding: '8px 18px', fontWeight: 900, fontSize: 13, cursor: editSaving ? 'wait' : 'pointer', opacity: editSaving ? 0.5 : 1 }}>
                  {editSaving ? 'Saving…' : '✓ Save'}
                </button>
              </header>

              <div style={{ flex: 1, padding: 20, maxWidth: 900, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
                {/* Image section */}
                <section style={{ backgroundColor: '#0f1a2e', borderRadius: 16, padding: 20, marginBottom: 16 }}>
                  <h2 style={{ color: '#f5c518', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 12px' }}>Image</h2>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ width: 240, height: 240, borderRadius: 12, background: editForm.image_url ? `url(${editForm.image_url}) center/cover` : '#1a2e5a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                      {!editForm.image_url && '📷 no image'}
                    </div>
                    <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <label style={{ display: 'inline-block', padding: '10px 16px', borderRadius: 10, backgroundColor: '#f5c518', color: '#060d1f', fontSize: 13, fontWeight: 800, cursor: editImgUploading ? 'wait' : 'pointer', textAlign: 'center', opacity: editImgUploading ? 0.6 : 1 }}>
                        {editImgUploading ? '⏳ Uploading…' : '📤 Upload image'}
                        <input type="file" accept="image/*" disabled={editImgUploading} style={{ display: 'none' }}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadProductImage(f); e.currentTarget.value = ''; }} />
                      </label>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>or paste a URL:</div>
                      <input value={editForm.image_url} onChange={e => setEditForm({ ...editForm, image_url: e.target.value })}
                        placeholder="https://…"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, boxSizing: 'border-box' }} />
                      {editForm.image_url && (
                        <button onClick={() => setEditForm({ ...editForm, image_url: '' })}
                          style={{ background: 'transparent', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' }}>
                          Clear image
                        </button>
                      )}
                    </div>
                  </div>
                </section>

                {/* Basics */}
                <section style={{ backgroundColor: '#0f1a2e', borderRadius: 16, padding: 20, marginBottom: 16 }}>
                  <h2 style={{ color: '#f5c518', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 12px' }}>Basics</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>Name</label>
                      <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 14, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>SKU (read-only)</label>
                      <input value={editingProduct.sku} readOnly
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(0,0,0,0.3)', color: 'rgba(255,255,255,0.5)', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>Category</label>
                      <select value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#0a1220', color: '#fff', fontSize: 14, boxSizing: 'border-box' }}>
                        <option value="">— pick one —</option>
                        {CATEGORIES_FOR_EXTRACT.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>Unit</label>
                      <input value={editForm.unit_of_measure} onChange={e => setEditForm({ ...editForm, unit_of_measure: e.target.value })}
                        placeholder="lb / case / each"
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 14, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>Pack size</label>
                      <input value={editForm.pack_size} onChange={e => setEditForm({ ...editForm, pack_size: e.target.value })}
                        placeholder="24x4oz / 50lb bag"
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 14, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>Status</label>
                      <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#0a1220', color: '#fff', fontSize: 14, boxSizing: 'border-box' }}>
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Channels */}
                <section style={{ backgroundColor: '#0f1a2e', borderRadius: 16, padding: 20, marginBottom: 16 }}>
                  <h2 style={{ color: '#f5c518', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 4px' }}>Sales channels</h2>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '0 0 12px' }}>Where this product is sold. Pricing per channel is set via /admin/inventory.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                    {([
                      ['sell_nassau',    '🟡 Nassau POS / shop'],
                      ['sell_andros',    '🟣 Andros'],
                      ['sell_online',    '🌐 Online'],
                      ['sell_wholesale', '📦 Wholesale'],
                    ] as const).map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, backgroundColor: editForm[key] ? 'rgba(245,197,24,0.15)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', border: `1px solid ${editForm[key] ? 'rgba(245,197,24,0.4)' : 'rgba(255,255,255,0.08)'}` }}>
                        <input type="checkbox" checked={editForm[key]} onChange={e => setEditForm({ ...editForm, [key]: e.target.checked })} />
                        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{label}</span>
                      </label>
                    ))}
                  </div>
                </section>

                {/* Power-user link to /admin/inventory for pricing + advanced fields */}
                <div style={{ textAlign: 'center', padding: '12px 0 30px' }}>
                  <Link href={`/admin/inventory?product=${editingProduct.id}`}
                    style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, textDecoration: 'underline' }}>
                    Open in /admin/inventory for pricing & advanced fields →
                  </Link>
                </div>
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
