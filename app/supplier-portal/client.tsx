'use client';

// app/supplier-portal/client.tsx
//
// Authenticated supplier sees their own data: products listed with BSC,
// open invoices, payment history, outstanding balance, and a quick form
// to add a new product offering.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const NAVY = '#060e1c';
const PANEL = '#0f1a2e';
const GOLD = '#c8860f';
const GOLD_BRIGHT = '#f4c842';
const TEXT_DIM = 'rgba(255,255,255,0.55)';
const BORDER = 'rgba(255,255,255,0.08)';
const RED = '#f87171';
const GREEN = '#4ade80';

type Invoice = {
  id: string;
  invoice_ref: string | null;
  total_amount: number | null;
  balance_owed: number | null;
  status: string | null;
  created_at: string;
  due_date?: string | null;
  summary: string | null;
};
type PurchaseOrder = {
  id: string;
  supplier_name: string | null;
  ai_summary: string | null;
  items: unknown;
  total_cost: number | null;
  status: string | null;
  processing_status: string | null;
  allocated_by: string | null;
  created_at: string;
};
type POItem = {
  name?: string;
  cases?: number;
  qty?: number;
  unitDescription?: string;
  unit?: string;
  costPerCase?: number;
  totalCost?: number;
};
type Payment = {
  id: string;
  invoice_id: string | null;
  amount: number;
  note: string | null;
  created_at: string;
};
type Product = {
  id: string;
  name: string;
  case_cost: number | null;
  weight_lbs: number | null;
  retail_price: number | null;
  wholesale_price: number | null;
  unit_cost: number | null;
  status: string | null;
  // Channel flags drive the disable/enable pill. "Active" = any flag true.
  sell_nassau?: boolean;
  sell_andros?: boolean;
  sell_online?: boolean;
  sell_wholesale?: boolean;
  // Live-inventory extra fields (populated for the table view only).
  sku?: string | null;
  category?: string | null;
  unit_of_measure?: string | null;
  pack_size?: string | null;
  image_url?: string | null;
  cost_per_unit?: number | null;
};

const PORTAL_CATEGORIES = [
  'Seafood','Meat','Poultry','Produce','Dry Goods','Frozen',
  'Dairy & Eggs','Beverages','Snacks','Cleaning & Paper','Personal Care','Other',
];
type RowSaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  supplierId: string;
  supplierName: string;
  supplierEmail: string | null;
  role: string;
  displayName: string | null;
};

export default function SupplierPortalClient({
  supplierId, supplierName, supplierEmail, role, displayName,
}: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  // Live products from public.products — these are the rows the customer
  // sees on /market. Supplier can pause/resume each one (Task #87 Phase 2).
  const [liveCatalog, setLiveCatalog] = useState<Product[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleMsg, setToggleMsg] = useState<string | null>(null);

  // Inline-table row save state — matches /supplier/[id] table.
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

  async function patchLiveProduct(id: string, patch: Record<string, unknown>) {
    setRowStatus(id, 'saving');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setRowStatus(id, 'error', 'Sign-in expired'); return; }
      const res = await fetch('/api/supplier-portal/update-product', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ product_id: id, patch }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setRowStatus(id, 'error', j.error || `HTTP ${res.status}`); return; }
      setRowStatus(id, 'saved');
    } catch (e) {
      setRowStatus(id, 'error', e instanceof Error ? e.message : 'save failed');
    }
  }

  function patchLiveField<K extends keyof Product>(id: string, field: K, value: Product[K]) {
    setLiveCatalog(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    patchLiveProduct(id, { [field]: value });
  }

  // Add-product modal state (supplier self-listing)
  const [addOpen,    setAddOpen]    = useState(false);
  const [addBusy,    setAddBusy]    = useState(false);
  const [addErr,     setAddErr]     = useState<string | null>(null);
  const [aName,      setAName]      = useState('');
  const [aCategory,  setACategory]  = useState('produce');
  const [aUnit,      setAUnit]      = useState('lb');
  const [aPack,      setAPack]      = useState('');
  const [aCost,      setACost]      = useState('');
  const [aImageUrl,  setAImageUrl]  = useState('');
  const [aImgBusy,   setAImgBusy]   = useState(false);
  const [aOnline,    setAOnline]    = useState(true);
  const [aWholesale, setAWholesale] = useState(false);

  function resetAddForm() {
    setAName(''); setACategory('produce'); setAUnit('lb'); setAPack('');
    setACost(''); setAImageUrl(''); setAOnline(true); setAWholesale(false);
    setAddErr(null);
  }

  async function uploadAddImage(file: File) {
    setAImgBusy(true);
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg';
      const path = `products/new-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('site-images').upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) { setAddErr(`Image upload failed: ${upErr.message}`); return; }
      const { data: pub } = supabase.storage.from('site-images').getPublicUrl(path);
      setAImageUrl(pub.publicUrl);
    } finally {
      setAImgBusy(false);
    }
  }

  async function submitNewProduct() {
    setAddErr(null);
    if (!aName.trim())                                { setAddErr('Product name required'); return; }
    if (!aCost.trim() || !(Number(aCost) > 0))        { setAddErr('Cost must be greater than zero'); return; }
    if (!aOnline && !aWholesale)                      { setAddErr('Pick at least one channel (Online or Wholesale)'); return; }
    setAddBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setAddErr('Sign-in expired — refresh.'); return; }
      const res = await fetch('/api/supplier-portal/add-product', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          name:            aName,
          category:        aCategory,
          unit_of_measure: aUnit,
          pack_size:       aPack || null,
          image_url:       aImageUrl || null,
          cost_per_unit:   Number(aCost),
          channels:        { online: aOnline, wholesale: aWholesale },
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setAddErr(j.error || `HTTP ${res.status}`); return; }
      const warn = j.warning ? ` (${j.warning})` : '';
      setToggleMsg(`✅ ${aName} added · SKU ${j.sku}${warn}`);
      setAddOpen(false);
      resetAddForm();
      await load();
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setAddBusy(false);
    }
  }

  async function uploadLiveImage(p: Product, file: File) {
    setRowImgBusy(prev => ({ ...prev, [p.id]: true }));
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg';
      const path = `products/${p.sku ?? p.id.slice(0,8)}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('site-images')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) { setRowStatus(p.id, 'error', `image: ${upErr.message}`); return; }
      const { data: pub } = supabase.storage.from('site-images').getPublicUrl(path);
      patchLiveField(p.id, 'image_url', pub.publicUrl);
    } finally {
      setRowImgBusy(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    }
  }
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<{ invoices?: string; payments?: string; products?: string; pos?: string; catalog?: string }>({});
  const [busyPoId, setBusyPoId] = useState<string | null>(null);
  const [poError, setPoError] = useState<string | null>(null);

  // Add-product form state
  const [showProdForm, setShowProdForm] = useState(false);
  const [pName, setPName] = useState('');
  const [pCaseCost, setPCaseCost] = useState('');
  const [pWeight, setPWeight] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErrors({});
    setPoError(null);
    const [invRes, payRes, prodRes, poRes, catRes] = await Promise.all([
      supabase
        .from('purchase_invoices')
        .select('id, invoice_ref, total_amount, balance_owed, status, created_at, due_date, summary')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('invoice_payments')
        .select('id, invoice_id, amount, note, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('supplier_products')
        .select('id, name, case_cost, weight_lbs, retail_price, wholesale_price, unit_cost, status')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })
        .limit(200),
      // POs are matched by supplier_name (text), not supplier_id — that's
      // how the existing /purchase-orders flow writes them. ilike matches
      // case-insensitively and tolerates trailing whitespace.
      supabase
        .from('purchase_orders')
        .select('id, supplier_name, ai_summary, items, total_cost, status, processing_status, allocated_by, created_at')
        .ilike('supplier_name', supplierName.trim())
        .order('created_at', { ascending: false })
        .limit(100),
      // Live catalog rows owned by this supplier — drives the pause/resume
      // controls below. Reads sell_* flags so we can show channel pills.
      supabase
        .from('products')
        .select('id, sku, name, category, unit_of_measure, pack_size, image_url, sell_nassau, sell_andros, sell_online, sell_wholesale, status')
        .eq('primary_supplier_id', supplierId)
        .order('name', { ascending: true })
        .limit(500),
    ]);
    const errs: typeof errors = {};
    if (invRes.error) errs.invoices = invRes.error.message; else setInvoices((invRes.data || []) as Invoice[]);
    if (payRes.error) errs.payments = payRes.error.message; else setPayments((payRes.data || []) as Payment[]);
    if (prodRes.error) errs.products = prodRes.error.message; else setProducts((prodRes.data || []) as Product[]);
    if (poRes.error)   errs.pos = poRes.error.message;       else setPos((poRes.data || []) as PurchaseOrder[]);
    if (catRes.error)  errs.catalog = catRes.error.message;  else {
      type LiveRow = {
        id: string; sku: string | null; name: string;
        category: string | null; unit_of_measure: string | null; pack_size: string | null;
        image_url: string | null;
        sell_nassau: boolean; sell_andros: boolean; sell_online: boolean; sell_wholesale: boolean;
        status: string | null;
      };
      const list = (catRes.data || []) as LiveRow[];
      // Fetch current costs in a second query — embedded join was returning 0 rows.
      let costMap: Record<string, number | null> = {};
      if (list.length > 0) {
        const ids = list.map((r) => r.id);
        const { data: costs } = await supabase
          .from('product_costs')
          .select('product_id, cost_per_unit')
          .in('product_id', ids)
          .eq('is_current', true);
        costMap = Object.fromEntries(((costs ?? []) as Array<{ product_id: string; cost_per_unit: number | null }>).map((c) => [c.product_id, c.cost_per_unit != null ? Number(c.cost_per_unit) : null]));
      }
      setLiveCatalog(list.map((r): Product => ({
        id: r.id, name: r.name, case_cost: null, weight_lbs: null, retail_price: null,
        wholesale_price: null, unit_cost: null, status: r.status,
        sell_nassau: r.sell_nassau, sell_andros: r.sell_andros,
        sell_online: r.sell_online, sell_wholesale: r.sell_wholesale,
        sku: r.sku, category: r.category, unit_of_measure: r.unit_of_measure,
        pack_size: r.pack_size, image_url: r.image_url,
        cost_per_unit: costMap[r.id] ?? null,
      })));
    }
    setErrors(errs);
    setLoading(false);
  }

  // Pause / resume a live product via the supplier-self-serve endpoint.
  // Disable clears all four sell_* flags; enable flips sell_online back on
  // (the channel suppliers participate in via /market).
  async function toggleLiveProduct(p: Product) {
    const isActive = !!(p.sell_nassau || p.sell_andros || p.sell_online || p.sell_wholesale);
    setTogglingId(p.id);
    setToggleMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/supplier-portal/toggle-product', {
        method: 'POST',
        headers,
        body: JSON.stringify({ product_id: p.id, enable: !isActive }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setToggleMsg(json.error || `HTTP ${res.status}`);
        return;
      }
      // Optimistic merge of the returned flag set so the row updates
      // without a full refetch.
      setLiveCatalog((prev) => prev.map((row) => row.id === p.id ? {
        ...row,
        sell_nassau:    json.product.sell_nassau,
        sell_andros:    json.product.sell_andros,
        sell_online:    json.product.sell_online,
        sell_wholesale: json.product.sell_wholesale,
      } : row));
      setToggleMsg(isActive ? `${p.name} paused — buyers can’t see it.` : `${p.name} is live again.`);
      setTimeout(() => setToggleMsg(null), 4000);
    } catch (err) {
      setToggleMsg(err instanceof Error ? err.message : 'Network error');
    } finally {
      setTogglingId(null);
    }
  }

  async function advancePoStatus(po: PurchaseOrder, next: string) {
    setBusyPoId(po.id);
    setPoError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/supplier-portal/po-status', {
        method: 'POST',
        headers,
        body: JSON.stringify({ purchase_order_id: po.id, next_status: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setPoError(json.error || 'Status update failed');
        setBusyPoId(null);
        return;
      }
      await load();
    } catch (e) {
      setPoError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusyPoId(null);
    }
  }

  function pickNumber(po: PurchaseOrder) {
    return `PICK-${po.id.slice(0, 8).toUpperCase()}`;
  }
  function parsePoItems(raw: unknown): POItem[] {
    if (!raw) return [];
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { return []; }
    }
    if (!Array.isArray(raw)) return [];
    return raw as POItem[];
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [supplierId]);

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const totalOutstanding = invoices.reduce((s, i) => s + Number(i.balance_owed || 0), 0);
  const myInvoiceIds = new Set(invoices.map((i) => i.id));
  const myPayments = payments.filter((p) => p.invoice_id && myInvoiceIds.has(p.invoice_id));
  const totalPaid = myPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  const liveProducts = products.filter((p) => p.status === 'live').length;
  const pendingProducts = products.filter((p) => p.status === 'pending').length;

  const todayIso = new Date().toISOString().slice(0, 10);

  async function submitProduct(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);
    if (!pName.trim()) { setSubmitErr('Product name required.'); return; }
    const cc = parseFloat(pCaseCost) || 0;
    const w = parseFloat(pWeight) || 0;
    if (cc <= 0 || w <= 0) { setSubmitErr('Case cost and weight must be > 0.'); return; }
    setSubmitting(true);
    const unitCost = cc / w;
    const { error } = await supabase.from('supplier_products').insert({
      supplier_id: supplierId,
      name: pName.trim(),
      case_cost: cc,
      weight_lbs: w,
      unit_cost: round4(unitCost),
      status: 'pending',
      supplier_name: supplierName,
      created_at: new Date().toISOString(),
    });
    setSubmitting(false);
    if (error) { setSubmitErr(error.message); return; }
    setPName(''); setPCaseCost(''); setPWeight('');
    setShowProdForm(false);
    await load();
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: NAVY,
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, "DM Sans", sans-serif',
        padding: '24px 16px 80px',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 3, color: GOLD, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
              BSC · Supplier portal
            </div>
            <h1 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 26, fontWeight: 700, margin: 0 }}>
              {supplierName}
            </h1>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>
              {role}{displayName ? ` · ${displayName}` : ''}{supplierEmail ? ` · ${supplierEmail}` : ''}
            </div>
          </div>
          <Link
            href="/dashboard"
            style={{
              fontSize: 12, color: TEXT_DIM, textDecoration: 'none',
              padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}`,
            }}
          >BSC Control →</Link>
        </div>

        {/* Money summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 22 }}>
          <Stat label="Lifetime invoiced" value={`$${totalInvoiced.toFixed(2)}`} />
          <Stat label="Lifetime paid" value={`$${totalPaid.toFixed(2)}`} accent={GREEN} />
          <Stat
            label="BSC owes you"
            value={`$${totalOutstanding.toFixed(2)}`}
            accent={totalOutstanding > 0 ? GOLD_BRIGHT : TEXT_DIM}
          />
        </div>

        {loading && <p style={{ color: TEXT_DIM }}>Loading your data…</p>}

        {(errors.invoices || errors.payments) && (
          <div
            style={{
              background: 'rgba(248,113,113,0.08)',
              border: `1px solid ${RED}33`,
              color: RED,
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            ⚠️ Could not load invoices / payments. Some data may be hidden.
          </div>
        )}

        {/* BSC Marketplace orders to you */}
        <Section
          title="BSC Marketplace orders"
          right={
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              {pos.filter((p) => !['delivered', 'cancelled'].includes((p.status || '').toLowerCase())).length} active
            </span>
          }
        >
          {errors.pos && (
            <div
              style={{
                background: 'rgba(248,113,113,0.08)',
                border: `1px solid ${RED}33`,
                color: RED,
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 11,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              ⚠️ {errors.pos}
            </div>
          )}
          {poError && (
            <div
              style={{
                background: 'rgba(248,113,113,0.08)',
                border: `1px solid ${RED}33`,
                color: RED,
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 11,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              ⚠️ {poError}
            </div>
          )}
          {pos.length === 0 ? (
            <p style={{ color: TEXT_DIM, fontSize: 13, margin: 0 }}>
              No purchase orders from BSC yet.
            </p>
          ) : (
            pos.map((po) => {
              const status = (po.status || 'allocated').toLowerCase();
              const items = parsePoItems(po.items);
              const totalUnits = items.reduce(
                (s, it) => s + Number(it.cases ?? it.qty ?? 0),
                0
              );
              const next: { label: string; value: string } | null =
                status === 'allocated' ? { label: 'Mark preparing', value: 'preparing' }
              : status === 'preparing' ? { label: 'Mark ready for pickup/delivery', value: 'ready' }
              : status === 'ready'     ? { label: 'Mark delivered', value: 'delivered' }
              : null;
              const tone =
                status === 'delivered' ? GREEN
              : status === 'ready'     ? GOLD_BRIGHT
              : status === 'preparing' ? '#a78bfa'
              : status === 'cancelled' ? RED
              : '#94a3b8';

              return (
                <div
                  key={po.id}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${BORDER}`,
                    borderLeft: `4px solid ${tone}`,
                    borderRadius: 10,
                    padding: '12px 14px',
                    marginTop: 8,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          color: '#fff',
                          fontFamily: 'monospace',
                        }}
                      >
                        {pickNumber(po)}
                      </div>
                      <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>
                        {fmtDate(po.created_at)} · {totalUnits} units · {items.length} SKU
                        {items.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {po.total_cost != null && (
                        <div style={{ fontSize: 14, fontWeight: 900, color: GOLD_BRIGHT }}>
                          ${Number(po.total_cost).toFixed(2)}
                        </div>
                      )}
                      <span
                        style={{
                          display: 'inline-block',
                          marginTop: 4,
                          fontSize: 9,
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: tone,
                          color: NAVY,
                        }}
                      >
                        {status}
                      </span>
                    </div>
                  </div>

                  {items.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {items.map((it, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '4px 0',
                            fontSize: 12,
                            color: '#cbd5e1',
                            borderBottom: i < items.length - 1 ? '1px dotted rgba(255,255,255,0.05)' : 'none',
                          }}
                        >
                          <span>{it.name || 'Item'}</span>
                          <span style={{ color: '#fff', fontWeight: 700 }}>
                            {Number(it.cases ?? it.qty ?? 0)}{' '}
                            {it.unitDescription || it.unit || 'units'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {next && (
                    <button
                      type="button"
                      onClick={() => advancePoStatus(po, next.value)}
                      disabled={busyPoId === po.id}
                      style={{
                        marginTop: 10,
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: 'none',
                        background:
                          busyPoId === po.id
                            ? '#4b5563'
                            : next.value === 'delivered'
                              ? GREEN
                              : GOLD_BRIGHT,
                        color: NAVY,
                        fontWeight: 800,
                        fontSize: 12,
                        cursor: busyPoId === po.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {busyPoId === po.id ? 'Saving…' : `→ ${next.label}`}
                    </button>
                  )}
                </div>
              );
            })
          )}
          <p style={{ fontSize: 10, color: TEXT_DIM, marginTop: 8 }}>
            Pick numbers tie to BSC&rsquo;s receiving slip. Mark each PO
            forward as you prepare and deliver.
          </p>
        </Section>

        {/* Open invoices */}
        <Section title="Open invoices" right={<span style={{ fontSize: 11, color: TEXT_DIM }}>{invoices.filter((i) => Number(i.balance_owed) > 0).length} open</span>}>
          {invoices.length === 0 ? (
            <p style={{ color: TEXT_DIM, fontSize: 13, margin: 0 }}>No invoices yet.</p>
          ) : (
            invoices.map((i) => {
              const open = Number(i.balance_owed || 0) > 0;
              const overdue = open && i.due_date && i.due_date < todayIso;
              return (
                <div
                  key={i.id}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 10,
                    padding: '12px 14px',
                    marginTop: 8,
                    borderLeft: `4px solid ${overdue ? RED : open ? GOLD_BRIGHT : GREEN}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                        {i.invoice_ref || 'Invoice'}
                      </div>
                      <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>
                        {i.created_at.slice(0, 10)}
                        {i.summary ? ` · ${i.summary}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: GOLD_BRIGHT }}>
                        ${Number(i.total_amount || 0).toFixed(2)}
                      </div>
                      {open && (
                        <div style={{ fontSize: 11, color: overdue ? RED : GOLD_BRIGHT, marginTop: 2 }}>
                          {overdue ? 'OVERDUE ' : 'open '}${Number(i.balance_owed || 0).toFixed(2)}
                          {i.due_date && ` · due ${i.due_date}`}
                        </div>
                      )}
                      {!open && (
                        <div style={{ fontSize: 11, color: GREEN, marginTop: 2 }}>PAID</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </Section>

        {/* Recent payments */}
        <Section title="Recent payments">
          {myPayments.length === 0 ? (
            <p style={{ color: TEXT_DIM, fontSize: 13, margin: 0 }}>No payments recorded yet.</p>
          ) : (
            myPayments.slice(0, 10).map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  marginTop: 8,
                  fontSize: 12,
                }}
              >
                <div style={{ color: '#fff' }}>
                  {p.created_at.slice(0, 10)}
                  {p.note ? ` · ${p.note}` : ''}
                </div>
                <div style={{ color: GREEN, fontWeight: 800 }}>
                  ${Number(p.amount).toFixed(2)}
                </div>
              </div>
            ))
          )}
        </Section>

        {/* My products */}
        <Section
          title="My product offerings"
          right={
            <button
              onClick={() => setShowProdForm((v) => !v)}
              style={{
                background: GOLD_BRIGHT,
                color: NAVY,
                border: 'none',
                borderRadius: 8,
                padding: '5px 12px',
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {showProdForm ? '× Cancel' : '+ Submit'}
            </button>
          }
        >
          <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 8 }}>
            {liveProducts} live · {pendingProducts} pending review
          </div>

          {showProdForm && (
            <form
              onSubmit={submitProduct}
              style={{
                background: 'rgba(244,200,66,0.06)',
                border: `1px solid ${GOLD}33`,
                borderRadius: 10,
                padding: 12,
                marginTop: 8,
                marginBottom: 12,
              }}
            >
              <FieldLabel>Product name</FieldLabel>
              <input
                type="text"
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="e.g. Fresh Grouper Whole"
                style={inputStyle}
                required
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <FieldLabel>Case cost (BSD)</FieldLabel>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={pCaseCost}
                    onChange={(e) => setPCaseCost(e.target.value)}
                    placeholder="0.00"
                    style={inputStyle}
                    required
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <FieldLabel>Weight (lbs)</FieldLabel>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={pWeight}
                    onChange={(e) => setPWeight(e.target.value)}
                    placeholder="0"
                    style={inputStyle}
                    required
                  />
                </div>
              </div>
              {submitErr && (
                <div
                  style={{
                    background: 'rgba(248,113,113,0.08)',
                    border: `1px solid ${RED}33`,
                    color: RED,
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 11,
                    marginBottom: 8,
                  }}
                >
                  ⚠️ {submitErr}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: 'none',
                  background: submitting ? '#4b5563' : GOLD_BRIGHT,
                  color: NAVY,
                  fontWeight: 900,
                  fontSize: 13,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  marginTop: 4,
                }}
              >
                {submitting ? 'Submitting…' : 'Submit for review'}
              </button>
            </form>
          )}

          {products.length === 0 ? (
            <p style={{ color: TEXT_DIM, fontSize: 13, margin: 0 }}>
              No products listed yet. Hit “+ Submit” to add your first.
            </p>
          ) : (
            products.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  marginTop: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>
                    {p.weight_lbs ? `${Number(p.weight_lbs).toFixed(1)} lb · ` : ''}
                    {p.case_cost != null ? `case $${Number(p.case_cost).toFixed(2)}` : ''}
                    {p.unit_cost != null ? ` · $${Number(p.unit_cost).toFixed(2)}/lb` : ''}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    fontWeight: 800,
                    padding: '4px 8px',
                    borderRadius: 999,
                    background:
                      p.status === 'live' ? GREEN :
                      p.status === 'pending' ? GOLD_BRIGHT : TEXT_DIM,
                    color: NAVY,
                  }}
                >
                  {p.status || '—'}
                </span>
              </div>
            ))
          )}
        </Section>

        {/* Live catalog — supplier pauses / resumes their /market listings here */}
        <Section title="Live in marketplace" right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 1 }}>
              {liveCatalog.filter((p) => !!(p.sell_nassau || p.sell_andros || p.sell_online || p.sell_wholesale)).length} active
            </span>
            <button onClick={() => { resetAddForm(); setAddOpen(true); }}
              style={{ background: GOLD_BRIGHT, color: NAVY, border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
              + Add Product
            </button>
          </div>
        }>
          {errors.catalog && (
            <p style={{ color: RED, fontSize: 12, margin: '4px 0' }}>⚠️ {errors.catalog}</p>
          )}
          {toggleMsg && (
            <div style={{ background: 'rgba(74,222,128,0.10)', border: `1px solid ${GREEN}55`, color: GREEN, borderRadius: 8, padding: '8px 10px', fontSize: 12, margin: '4px 0 10px' }}>
              {toggleMsg}
            </div>
          )}
          {liveCatalog.length === 0 ? (
            <p style={{ color: TEXT_DIM, fontSize: 13, margin: 0 }}>
              No live products under your name yet. Submissions show up here once Dedrick approves them.
            </p>
          ) : (
            <div style={{ marginTop: 6, borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#e2e8f0', minWidth: 1080 }}>
                  <thead>
                    <tr style={{ backgroundColor: 'rgba(255,255,255,0.04)', textAlign: 'left', borderBottom: `1px solid ${BORDER}` }}>
                      <th style={{ padding: '8px 8px', width: 44 }}>Live</th>
                      <th style={{ padding: '8px 8px', minWidth: 200 }}>Name</th>
                      <th style={{ padding: '8px 8px', minWidth: 130 }}>Category</th>
                      <th style={{ padding: '8px 8px', width: 80 }}>Unit</th>
                      <th style={{ padding: '8px 8px', width: 100 }}>Pack</th>
                      <th style={{ padding: '8px 8px', width: 90 }}>Cost $</th>
                      <th style={{ padding: '8px 8px', minWidth: 220 }}>Image</th>
                      <th style={{ padding: '8px 8px', textAlign: 'center', width: 46 }}>Nas</th>
                      <th style={{ padding: '8px 8px', textAlign: 'center', width: 46 }}>And</th>
                      <th style={{ padding: '8px 8px', textAlign: 'center', width: 46 }}>Onl</th>
                      <th style={{ padding: '8px 8px', textAlign: 'center', width: 46 }}>Whs</th>
                      <th style={{ padding: '8px 8px', width: 80, textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveCatalog.map((p) => {
                      const isActive = p.status === 'active';
                      const state    = rowState[p.id] ?? 'idle';
                      const err      = rowError[p.id];
                      const imgBusy  = !!rowImgBusy[p.id];
                      const rowBg    = state === 'error' ? 'rgba(220,38,38,0.08)' : state === 'saved' ? 'rgba(34,197,94,0.06)' : 'transparent';
                      const inp: React.CSSProperties = { width: '100%', padding: '5px 7px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box' };
                      const sel: React.CSSProperties = { ...inp, backgroundColor: '#0a1220' };
                      return (
                        <tr key={p.id} style={{ borderTop: `1px solid ${BORDER}`, backgroundColor: rowBg, opacity: isActive ? 1 : 0.55 }}>
                          <td style={{ padding: '6px 8px' }}>
                            <input type="checkbox" checked={isActive}
                              onChange={(e) => patchLiveField(p.id, 'status', e.target.checked ? 'active' : 'inactive')} />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input defaultValue={p.name}
                              onBlur={(e) => { if (e.target.value !== p.name) patchLiveField(p.id, 'name', e.target.value); }}
                              style={inp} />
                            <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{p.sku ?? ''}</div>
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <select value={p.category ?? ''}
                              onChange={(e) => patchLiveField(p.id, 'category', e.target.value || null)}
                              style={sel}>
                              <option value="">—</option>
                              {PORTAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input defaultValue={p.unit_of_measure ?? ''}
                              onBlur={(e) => { if (e.target.value !== (p.unit_of_measure ?? '')) patchLiveField(p.id, 'unit_of_measure', e.target.value || null); }}
                              style={inp} />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input defaultValue={p.pack_size ?? ''}
                              onBlur={(e) => { if (e.target.value !== (p.pack_size ?? '')) patchLiveField(p.id, 'pack_size', e.target.value || null); }}
                              style={inp} />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input type="number" step="0.01" inputMode="decimal"
                              defaultValue={p.cost_per_unit ?? ''}
                              onBlur={(e) => {
                                const next = e.target.value === '' ? null : Number(e.target.value);
                                if (next != null && next !== p.cost_per_unit && next > 0) {
                                  setLiveCatalog(prev => prev.map(x => x.id === p.id ? { ...x, cost_per_unit: next } : x));
                                  patchLiveProduct(p.id, { cost_per_unit: next });
                                }
                              }}
                              style={{ ...inp, textAlign: 'right' }} />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input defaultValue={p.image_url ?? ''} placeholder="https://… or use 📷"
                                onBlur={(e) => { if (e.target.value !== (p.image_url ?? '')) patchLiveField(p.id, 'image_url', e.target.value || null); }}
                                style={{ ...inp, flex: 1 }} />
                              <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 26, borderRadius: 6, backgroundColor: GOLD_BRIGHT, color: NAVY, fontSize: 13, fontWeight: 800, cursor: imgBusy ? 'wait' : 'pointer', opacity: imgBusy ? 0.6 : 1 }}>
                                {imgBusy ? '⏳' : '📷'}
                                <input type="file" accept="image/*" disabled={imgBusy} style={{ display: 'none' }}
                                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLiveImage(p, f); e.currentTarget.value = ''; }} />
                              </label>
                              {p.image_url && (
                                <a href={p.image_url} target="_blank" rel="noopener noreferrer"
                                  title="Open image" style={{ color: GREEN, textDecoration: 'none', fontSize: 14 }}>↗</a>
                              )}
                            </div>
                          </td>
                          {(['sell_nassau','sell_andros','sell_online','sell_wholesale'] as const).map(ch => (
                            <td key={ch} style={{ padding: '6px 8px', textAlign: 'center' }}>
                              <input type="checkbox" checked={!!p[ch]}
                                onChange={(e) => patchLiveField(p.id, ch, e.target.checked)} />
                            </td>
                          ))}
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            {state === 'saving' && <span style={{ fontSize: 10, color: '#fbbf24' }}>saving…</span>}
                            {state === 'saved'  && <span style={{ fontSize: 10, color: GREEN }}>✓ saved</span>}
                            {state === 'error'  && <span title={err} style={{ fontSize: 10, color: '#fca5a5', fontWeight: 700 }}>⚠ err</span>}
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
                    const prod = liveCatalog.find(p => p.id === id);
                    return <div key={id}><strong>{prod?.name ?? id.slice(0,8)}:</strong> {e}</div>;
                  })}
                </div>
              )}
            </div>
          )}
        </Section>
      </div>

      {/* ── ADD-PRODUCT MODAL (supplier self-listing) ── */}
      {addOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ color: '#fff', margin: 0, fontWeight: 800, fontSize: 16 }}>+ Add Product</h3>
                <p style={{ color: TEXT_DIM, margin: '4px 0 0', fontSize: 11 }}>You list it. BSC applies the markup. It goes live the moment you save.</p>
              </div>
              <button onClick={() => setAddOpen(false)} disabled={addBusy}
                style={{ background: 'transparent', color: TEXT_DIM, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: addBusy ? 'not-allowed' : 'pointer' }}>
                Close
              </button>
            </div>

            <div style={{ padding: 20 }}>
              {addErr && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(239,68,68,0.10)', border: `1px solid ${RED}55`, borderRadius: 8, color: '#fca5a5', fontSize: 12, fontWeight: 600 }}>
                  ⚠ {addErr}
                </div>
              )}

              {/* Image */}
              <label style={{ display: 'block', color: GOLD_BRIGHT, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Image (optional)</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                <div style={{ width: 80, height: 80, borderRadius: 10, background: aImageUrl ? `url(${aImageUrl}) center/cover` : 'rgba(255,255,255,0.05)', border: `1px dashed ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TEXT_DIM, fontSize: 11 }}>
                  {!aImageUrl && '📷'}
                </div>
                <label style={{ padding: '8px 14px', borderRadius: 8, background: GOLD_BRIGHT, color: NAVY, fontWeight: 800, fontSize: 12, cursor: aImgBusy ? 'wait' : 'pointer', opacity: aImgBusy ? 0.6 : 1 }}>
                  {aImgBusy ? '⏳ Uploading…' : '📤 Upload image'}
                  <input type="file" accept="image/*" disabled={aImgBusy} style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAddImage(f); e.currentTarget.value = ''; }} />
                </label>
              </div>

              <label style={{ display: 'block', color: GOLD_BRIGHT, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Product name *</label>
              <input value={aName} onChange={e => setAName(e.target.value)} placeholder="e.g. Fresh Snapper" style={inputStyle} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', color: GOLD_BRIGHT, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Category *</label>
                  <select value={aCategory} onChange={e => setACategory(e.target.value)} style={inputStyle}>
                    <option value="fresh_seafood">Fresh seafood</option>
                    <option value="frozen_seafood">Frozen seafood</option>
                    <option value="processed_seafood">Processed seafood</option>
                    <option value="produce">Produce</option>
                    <option value="meat">Meat</option>
                    <option value="grocery">Grocery</option>
                    <option value="beverages">Beverages</option>
                    <option value="snack">Snack</option>
                    <option value="frozen_meat">Frozen meat</option>
                    <option value="spices">Spices</option>
                    <option value="dry_goods">Dry goods</option>
                    <option value="household">Household</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: GOLD_BRIGHT, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Unit *</label>
                  <select value={aUnit} onChange={e => setAUnit(e.target.value)} style={inputStyle}>
                    <option value="lb">lb</option>
                    <option value="case">case</option>
                    <option value="each">each</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', color: GOLD_BRIGHT, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Pack size</label>
                  <input value={aPack} onChange={e => setAPack(e.target.value)} placeholder="e.g. 24x4oz" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', color: GOLD_BRIGHT, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Your cost (BSD) *</label>
                  <input value={aCost} onChange={e => setACost(e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal" placeholder="0.00" style={{ ...inputStyle, textAlign: 'right', fontWeight: 700 }} />
                </div>
              </div>

              {/* Channels */}
              <label style={{ display: 'block', color: GOLD_BRIGHT, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Where should this sell?</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: aOnline ? 'rgba(244,200,66,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${aOnline ? GOLD_BRIGHT : BORDER}`, cursor: 'pointer' }}>
                  <input type="checkbox" checked={aOnline} onChange={e => setAOnline(e.target.checked)} />
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>🌐 Online retail</div>
                    <div style={{ color: TEXT_DIM, fontSize: 10 }}>BSC markup: 35%</div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: aWholesale ? 'rgba(244,200,66,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${aWholesale ? GOLD_BRIGHT : BORDER}`, cursor: 'pointer' }}>
                  <input type="checkbox" checked={aWholesale} onChange={e => setAWholesale(e.target.checked)} />
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>📦 Wholesale</div>
                    <div style={{ color: TEXT_DIM, fontSize: 10 }}>BSC markup: 12%</div>
                  </div>
                </label>
              </div>

              {/* Price preview */}
              {Number(aCost) > 0 && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: `1px solid ${GREEN}33`, color: '#86efac', fontSize: 12, marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Customer-facing price preview:</div>
                  {aOnline && <div>🌐 Online: <strong>${(Number(aCost) * 1.35).toFixed(2)}</strong></div>}
                  {aWholesale && <div>📦 Wholesale: <strong>${(Number(aCost) * 1.12).toFixed(2)}</strong></div>}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setAddOpen(false)} disabled={addBusy}
                  style={{ flex: 1, padding: '12px', borderRadius: 10, background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT_DIM, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={submitNewProduct} disabled={addBusy}
                  style={{ flex: 1, padding: '12px', borderRadius: 10, background: GOLD_BRIGHT, color: NAVY, border: 'none', fontWeight: 900, fontSize: 13, cursor: addBusy ? 'wait' : 'pointer', opacity: addBusy ? 0.6 : 1 }}>
                  {addBusy ? 'Adding…' : '✓ Add Product'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* primitives */

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: '#fff' }}>{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, color: TEXT_DIM, fontWeight: 700, textTransform: 'uppercase', margin: '8px 0 4px' }}>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: TEXT_DIM, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: accent || GOLD_BRIGHT, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function round4(n: number) { return Math.round(n * 10000) / 10000; }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
  border: `1.5px solid ${BORDER}`,
  color: '#fff',
  fontSize: 13,
  marginBottom: 8,
  boxSizing: 'border-box',
  outline: 'none',
};
