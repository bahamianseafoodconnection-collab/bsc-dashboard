// File: app/purchase-orders/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://auqjjrisivhfmpleusyt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg'
);

const NASSAU_MARGIN    = 1.38;
const ANDROS_MARGIN    = 1.43;
const ONLINE_MARGIN    = 1.25;
const WHOLESALE_MARGIN = 1.12;

type Screen = 'list' | 'new' | 'processing';

type POItem = {
  name: string;
  cases: number;
  unitDescription: string;
  totalLbs: number;
  costPerCase: number;
  totalCost: number;
};

type PurchaseOrder = {
  id: string;
  supplier_name: string;
  invoice_photo_url: string;
  ai_summary: string;
  items: POItem[];
  total_cost: number;
  retail_physical: number;
  retail_online: number;
  wholesale_physical: number;
  wholesale_online: number;
  status: string;
  allocated_by: string;
  created_at: string;
  // Processing fields
  weight_in_lbs: number;
  weight_out_lbs: number;
  yield_pct: number;
  true_cost_per_lb: number;
  processing_status: string;
  linked_product_id: string | null;
};

type Allocation = {
  retail_physical: number;
  retail_online: number;
  wholesale_physical: number;
  wholesale_online: number;
};

type SupplierProduct = {
  id: string;
  name: string;
  retail_price: number;
  wholesale_price: number;
  unit_cost: number;
  case_cost: number;
  status: string;
};

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('list');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // New PO state
  const [supplierName, setSupplierName] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [aiItems, setAiItems] = useState<POItem[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [manualItems, setManualItems] = useState<POItem[]>([
    { name: '', cases: 0, unitDescription: '', totalLbs: 0, costPerCase: 0, totalCost: 0 }
  ]);
  const [useManual, setUseManual] = useState(false);
  const [allocation, setAllocation] = useState<Allocation>({
    retail_physical: 0, retail_online: 0, wholesale_physical: 0, wholesale_online: 0,
  });
  const [allocatedBy, setAllocatedBy] = useState('Dedrick Storr');

  // Processing/yield state
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [weightIn, setWeightIn] = useState('');
  const [weightOut, setWeightOut] = useState('');
  const [spinyProducts, setSpinyProducts] = useState<SupplierProduct[]>([]);
  const [linkedProductId, setLinkedProductId] = useState('');
  const [processingNote, setProcessingNote] = useState('');
  const [savingProcessing, setSavingProcessing] = useState(false);

  useEffect(() => { loadOrders(); loadSpinyProducts(); }, []);

  async function loadOrders() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setOrders(data as PurchaseOrder[]);
    } catch (e) {}
    setLoading(false);
  }

  async function loadSpinyProducts() {
    try {
      // Load Spiny Tails supplier products for linking
      const { data: spinySupplier } = await supabase
        .from('suppliers')
        .select('id')
        .eq('email', 'dedrick@bahamianseafoodconnection.com')
        .single();
      if (spinySupplier) {
        const { data: prods } = await supabase
          .from('supplier_products')
          .select('id, name, retail_price, wholesale_price, unit_cost, case_cost, status')
          .eq('supplier_id', spinySupplier.id)
          .order('name');
        if (prods) setSpinyProducts(prods);
      }
    } catch (e) {}
  }

  // Yield calculations (live, derived from inputs)
  const weightInNum  = parseFloat(weightIn)  || 0;
  const weightOutNum = parseFloat(weightOut) || 0;
  const yieldPct     = weightInNum > 0 && weightOutNum > 0
    ? parseFloat(((weightOutNum / weightInNum) * 100).toFixed(1))
    : 0;
  const trueCostPerLb = selectedOrder && weightOutNum > 0
    ? parseFloat((selectedOrder.total_cost / weightOutNum).toFixed(4))
    : 0;

  // Pricing preview from true cost
  const processingPricing = trueCostPerLb > 0 ? {
    nassauPrice:    parseFloat((trueCostPerLb * NASSAU_MARGIN).toFixed(2)),
    androsPrice:    parseFloat((trueCostPerLb * ANDROS_MARGIN).toFixed(2)),
    onlinePrice:    parseFloat((trueCostPerLb * ONLINE_MARGIN).toFixed(2)),
    wholesalePrice: parseFloat((trueCostPerLb * WHOLESALE_MARGIN).toFixed(2)),
  } : null;

  async function handlePhotoUpload(file: File) {
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setAiLoading(true);
    setAiSummary(''); setAiItems([]);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64    = (e.target?.result as string).split(',')[1];
        const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
        const res = await fetch('/api/ai', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system: `You are an invoice reading assistant for BSC Marketplace (Bahamian Seafood Connection), a seafood and food distribution business in Nassau, Bahamas. Analyze the invoice image and extract all line items. Respond ONLY with a valid JSON object in this exact format, no other text: {"supplier":"supplier name from invoice","summary":"brief 1-2 sentence summary of the invoice","items":[{"name":"product name","cases":5,"unitDescription":"e.g. 33lb case, 10lb bag, etc","totalLbs":165,"costPerCase":45.00,"totalCost":225.00}],"totalCost":225.00} If you cannot read the invoice clearly, still return valid JSON with your best estimate and note uncertainty in the summary.`,
            messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }, { type: 'text', text: 'Please read this invoice and extract all line items.' }] }],
          }),
        });
        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        try {
          const clean  = text.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(clean);
          if (parsed.supplier && !supplierName) setSupplierName(parsed.supplier);
          setAiSummary(parsed.summary || 'Invoice processed');
          setAiItems(parsed.items || []);
          if (parsed.items?.length > 0) {
            const totalCases = parsed.items.reduce((s: number, i: POItem) => s + i.cases, 0);
            setAllocation({
              retail_physical:   Math.round(totalCases * 0.4),
              retail_online:     Math.round(totalCases * 0.2),
              wholesale_physical: Math.round(totalCases * 0.3),
              wholesale_online:  Math.round(totalCases * 0.1),
            });
          }
        } catch {
          setAiSummary('Could not fully parse invoice. Please verify items manually.');
          setUseManual(true);
        }
        setAiLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (e) { setAiLoading(false); setUseManual(true); }
  }

  function updateManualItem(index: number, field: keyof POItem, value: string | number) {
    setManualItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'cases' || field === 'costPerCase')
        updated[index].totalCost = updated[index].cases * updated[index].costPerCase;
      return updated;
    });
  }

  function addManualItem() {
    setManualItems(prev => [...prev, { name: '', cases: 0, unitDescription: '', totalLbs: 0, costPerCase: 0, totalCost: 0 }]);
  }
  function removeManualItem(index: number) {
    setManualItems(prev => prev.filter((_, i) => i !== index));
  }

  const activeItems    = useManual ? manualItems : aiItems;
  const totalCost      = activeItems.reduce((s, i) => s + i.totalCost, 0);
  const totalCases     = activeItems.reduce((s, i) => s + i.cases, 0);
  const allocatedCases = Object.values(allocation).reduce((s, v) => s + v, 0);
  const unallocated    = totalCases - allocatedCases;

  async function handleSubmit() {
    if (!supplierName) { setError('Supplier name required'); return; }
    if (activeItems.length === 0 || !activeItems[0].name) { setError('At least one item required'); return; }
    setProcessing(true); setError('');
    let photoUrl = '';
    if (photo) {
      const fileName = Date.now() + '-po-' + photo.name;
      const { error: uploadErr } = await supabase.storage.from('product-images').upload(fileName, photo);
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
        photoUrl = urlData.publicUrl;
      }
    }
    const { error: insertErr } = await supabase.from('purchase_orders').insert({
      supplier_name:      supplierName,
      invoice_photo_url:  photoUrl,
      ai_summary:         aiSummary || 'Manual entry',
      items:              JSON.stringify(activeItems),
      total_cost:         totalCost,
      retail_physical:    allocation.retail_physical,
      retail_online:      allocation.retail_online,
      wholesale_physical: allocation.wholesale_physical,
      wholesale_online:   allocation.wholesale_online,
      status:             'allocated',
      allocated_by:       allocatedBy,
      processing_status:  'awaiting_processing',
      weight_in_lbs:      0,
      weight_out_lbs:     0,
      yield_pct:          0,
      true_cost_per_lb:   0,
    });
    setProcessing(false);
    if (insertErr) { setError(insertErr.message); return; }
    setSuccess('Purchase order saved! Send to Spiny Tails for processing.');
    await loadOrders();
    setTimeout(() => {
      setSuccess(''); setScreen('list');
      setPhoto(null); setPhotoPreview('');
      setAiSummary(''); setAiItems(''); setSupplierName(''); setUseManual(false);
      setManualItems([{ name: '', cases: 0, unitDescription: '', totalLbs: 0, costPerCase: 0, totalCost: 0 }]);
      setAllocation({ retail_physical: 0, retail_online: 0, wholesale_physical: 0, wholesale_online: 0 });
    }, 2000);
  }

  function openProcessing(order: PurchaseOrder) {
    setSelectedOrder(order);
    setWeightIn(order.weight_in_lbs > 0 ? order.weight_in_lbs.toString() : '');
    setWeightOut(order.weight_out_lbs > 0 ? order.weight_out_lbs.toString() : '');
    setLinkedProductId(order.linked_product_id || '');
    setProcessingNote('');
    setError(''); setSuccess('');
    setScreen('processing');
  }

  async function handleSaveProcessing() {
    if (!selectedOrder) return;
    if (!weightIn || weightInNum <= 0) { setError('Enter starting weight (lbs in)'); return; }
    if (!weightOut || weightOutNum <= 0) { setError('Enter finished weight (lbs out)'); return; }
    if (weightOutNum > weightInNum) { setError('Finished weight cannot exceed starting weight'); return; }
    setSavingProcessing(true); setError('');

    // 1. Update the purchase order with yield data
    const { error: poErr } = await supabase.from('purchase_orders').update({
      weight_in_lbs:    weightInNum,
      weight_out_lbs:   weightOutNum,
      yield_pct:        yieldPct,
      true_cost_per_lb: trueCostPerLb,
      processing_status: 'processed',
      linked_product_id: linkedProductId || null,
      status:           'processed',
    }).eq('id', selectedOrder.id);

    if (poErr) { setError(poErr.message); setSavingProcessing(false); return; }

    // 2. If linked to a Spiny Tails product, create a PENDING price update for Dedrick to review
    if (linkedProductId && processingPricing) {
      const { error: prodErr } = await supabase.from('supplier_products').update({
        // Set to pending so Dedrick reviews before going live
        status:          'pending',
        unit_cost:       parseFloat(trueCostPerLb.toFixed(4)),
        case_cost:       parseFloat(trueCostPerLb.toFixed(4)),
        retail_price:    processingPricing.onlinePrice,
        wholesale_price: processingPricing.wholesalePrice,
      }).eq('id', linkedProductId);

      if (prodErr) {
        setError('Processing saved but price update failed: ' + prodErr.message);
        setSavingProcessing(false);
        return;
      }
    }

    setSavingProcessing(false);
    setSuccess(
      linkedProductId
        ? `✅ Yield recorded! True cost: $${trueCostPerLb.toFixed(4)}/lb · Yield: ${yieldPct}% · Price update sent to Spiny Tails for approval`
        : `✅ Yield recorded! True cost: $${trueCostPerLb.toFixed(4)}/lb · Yield: ${yieldPct}%`
    );
    await loadOrders();
    setTimeout(() => {
      setSuccess('');
      setScreen('list');
      setSelectedOrder(null);
      setWeightIn(''); setWeightOut('');
      setLinkedProductId(''); setProcessingNote('');
    }, 3000);
  }

  // ── STYLES ──
  const pg: React.CSSProperties = {
    padding: 18, backgroundColor: '#060d1f', minHeight: '100vh',
    color: '#fff', fontFamily: 'sans-serif', paddingBottom: 80,
    maxWidth: 620, margin: '0 auto',
  };
  const card: React.CSSProperties = {
    backgroundColor: '#0d1f3c', borderRadius: 14, padding: '16px 18px',
    border: '1px solid #1e3a5f', marginBottom: 14,
  };
  const inp: React.CSSProperties = {
    display: 'block', width: '100%', padding: '11px 13px', borderRadius: 10,
    backgroundColor: '#060d1f', color: '#fff', border: '1px solid #1e3a5f',
    fontSize: 14, marginBottom: 10, boxSizing: 'border-box' as const, outline: 'none',
  };
  const lbl: React.CSSProperties = {
    display: 'block', color: '#6b7280', fontSize: 10,
    letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 5,
  };
  const primaryBtn: React.CSSProperties = {
    width: '100%', padding: '14px', borderRadius: 12,
    backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold',
    border: 'none', fontSize: 15, cursor: 'pointer', marginBottom: 10,
  };
  const secondaryBtn: React.CSSProperties = {
    width: '100%', padding: '12px', borderRadius: 12,
    backgroundColor: 'transparent', color: '#6b7280',
    border: '1px solid #1e3a5f', fontSize: 14, cursor: 'pointer', marginBottom: 10,
  };

  const processingStatusColor = (ps: string) => ({
    awaiting_processing: '#f5c518',
    processed:           '#4ade80',
    pending_review:      '#60a5fa',
  }[ps] || '#6b7280');

  const processingStatusLabel = (ps: string) => ({
    awaiting_processing: '⏳ Awaiting Processing',
    processed:           '✅ Processed',
    pending_review:      '👁 Pending Review',
  }[ps] || ps);

  const BSCControlBack = () => (
    <button onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '1px solid #f5c518', borderRadius: 10, color: '#f5c518', fontWeight: 'bold', fontSize: 12, cursor: 'pointer', padding: '7px 14px', marginBottom: 14 }}>
      ← BSC Control
    </button>
  );

  // ── LIST SCREEN ──
  if (screen === 'list') return (
    <div style={pg}>
      <BSCControlBack />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, color: '#f5c518', fontSize: 20, fontWeight: 'bold' }}>📦 Purchase Orders</h1>
          <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>Spiny Tails Processing · BSC Marketplace</p>
        </div>
        <button onClick={() => setScreen('new')} style={{ backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: 12, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }}>
          + New PO
        </button>
      </div>

      {/* KPI STRIP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'TOTAL',      value: orders.length,                                                       color: '#fff'    },
          { label: 'PROCESSING', value: orders.filter(o => o.processing_status === 'awaiting_processing').length, color: '#f5c518' },
          { label: 'PROCESSED',  value: orders.filter(o => o.processing_status === 'processed').length,      color: '#4ade80' },
          { label: 'SPENT',      value: '$' + orders.reduce((s, o) => s + (o.total_cost || 0), 0).toFixed(0), color: '#60a5fa' },
        ].map(stat => (
          <div key={stat.label} style={{ ...card, textAlign: 'center', padding: 12, marginBottom: 0 }}>
            <p style={{ margin: 0, color: stat.color, fontSize: 18, fontWeight: 'bold' }}>{stat.value}</p>
            <p style={{ margin: '3px 0 0', color: '#4a5568', fontSize: 8, letterSpacing: 1 }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {loading && <p style={{ color: '#4a5568', textAlign: 'center', padding: 30 }}>Loading orders...</p>}

      {!loading && orders.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>📦</p>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 16, marginBottom: 6 }}>No Purchase Orders Yet</p>
          <p style={{ color: '#4a5568', fontSize: 13, marginBottom: 20 }}>Snap a fisherman invoice to create your first order</p>
          <button onClick={() => setScreen('new')} style={{ ...primaryBtn, width: 'auto', padding: '12px 28px' }}>Create First PO</button>
        </div>
      )}

      {orders.map(order => {
        let items: POItem[] = [];
        try { items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items; } catch {}
        const isProcessed  = order.processing_status === 'processed';
        const needsProcess = order.processing_status === 'awaiting_processing' || !order.processing_status;

        return (
          <div key={order.id} style={{ ...card, borderColor: needsProcess ? '#f5c51866' : '#1e3a5f' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>{order.supplier_name}</p>
                <p style={{ margin: '2px 0', color: '#4a5568', fontSize: 12 }}>
                  {new Date(order.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {order.allocated_by && ' · ' + order.allocated_by}
                </p>
                {order.ai_summary && <p style={{ margin: '4px 0 0', color: '#aaa', fontSize: 12, fontStyle: 'italic' }}>{order.ai_summary}</p>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>${order.total_cost?.toFixed(2) || '0.00'}</p>
                <p style={{ margin: '4px 0 0', color: processingStatusColor(order.processing_status), fontSize: 10, fontWeight: 'bold' }}>
                  {processingStatusLabel(order.processing_status || 'awaiting_processing')}
                </p>
              </div>
            </div>

            {/* ITEMS */}
            {items.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #1e3a5f' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>{item.name}</p>
                      <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>
                        {item.cases} cases{item.totalLbs > 0 ? ` · ${item.totalLbs} lbs in` : ''}
                      </p>
                    </div>
                    <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>${item.totalCost.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* YIELD SUMMARY if processed */}
            {isProcessed && order.weight_in_lbs > 0 && (
              <div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                <p style={{ margin: '0 0 8px', color: '#4ade80', fontWeight: 'bold', fontSize: 12 }}>🦞 PROCESSING RESULTS</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    { label: 'LBS IN',       value: order.weight_in_lbs + ' lbs',        color: '#aaa'     },
                    { label: 'LBS OUT',      value: order.weight_out_lbs + ' lbs',       color: '#4ade80'  },
                    { label: 'YIELD',        value: order.yield_pct + '%',               color: '#f5c518'  },
                    { label: 'TRUE COST/LB', value: '$' + (order.true_cost_per_lb || 0).toFixed(4), color: '#60a5fa'  },
                    { label: 'ONLINE PRICE', value: '$' + ((order.true_cost_per_lb || 0) * ONLINE_MARGIN).toFixed(2), color: '#4ade80' },
                    { label: 'NASSAU PRICE', value: '$' + ((order.true_cost_per_lb || 0) * NASSAU_MARGIN).toFixed(2), color: '#60a5fa' },
                  ].map(x => (
                    <div key={x.label} style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '6px 8px' }}>
                      <p style={{ margin: 0, color: '#4a5568', fontSize: 8, letterSpacing: 1 }}>{x.label}</p>
                      <p style={{ margin: '3px 0 0', color: x.color, fontWeight: 'bold', fontSize: 12 }}>{x.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PROCESSING BUTTON */}
            {needsProcess ? (
              <button onClick={() => openProcessing(order)} style={{ ...primaryBtn, marginBottom: 0 }}>
                🦞 Record Processing & Yield
              </button>
            ) : (
              <button onClick={() => openProcessing(order)} style={{ ...secondaryBtn, marginBottom: 0, color: '#4ade80', borderColor: '#4ade8066' }}>
                ✏️ Update Processing Data
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  // ── PROCESSING / YIELD SCREEN ──
  if (screen === 'processing' && selectedOrder) {
    let items: POItem[] = [];
    try { items = typeof selectedOrder.items === 'string' ? JSON.parse(selectedOrder.items) : selectedOrder.items; } catch {}

    return (
      <div style={pg}>
        <BSCControlBack />
        <button onClick={() => { setScreen('list'); setSelectedOrder(null); setError(''); setSuccess(''); }} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 14, cursor: 'pointer', marginBottom: 14, padding: 0 }}>
          ← Back to Orders
        </button>
        <h2 style={{ margin: '0 0 4px', color: '#f5c518', fontSize: 20 }}>🦞 Processing & Yield</h2>
        <p style={{ margin: '0 0 20px', color: '#4a5568', fontSize: 13 }}>Spiny Tails Processing Plant · Record finished weights to calculate true cost</p>

        {success && (
          <div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 14 }}>{success}</p>
          </div>
        )}

        {/* PO SUMMARY */}
        <div style={{ ...card, borderColor: '#f5c518' }}>
          <p style={{ margin: '0 0 10px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>📦 Purchase Order</p>
          <p style={{ margin: '0 0 4px', fontWeight: 'bold', fontSize: 15 }}>{selectedOrder.supplier_name}</p>
          <p style={{ margin: '0 0 10px', color: '#4a5568', fontSize: 12 }}>
            {new Date(selectedOrder.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${selectedOrder.total_cost.toFixed(2)} paid
          </p>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #1e3a5f' }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>{item.name}</p>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>
                  {item.cases} cases · {item.totalLbs > 0 ? item.totalLbs + ' lbs purchased' : 'lbs not recorded'}
                </p>
              </div>
              <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>${item.totalCost.toFixed(2)}</p>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 4, borderTop: '2px solid #1e3a5f' }}>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>Total Paid to Fisherman</p>
            <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>${selectedOrder.total_cost.toFixed(2)}</p>
          </div>
        </div>

        {/* WEIGHT INPUTS */}
        <div style={card}>
          <p style={{ margin: '0 0 14px', color: '#60a5fa', fontWeight: 'bold', fontSize: 13 }}>⚖️ WEIGHT RECORDING</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ ...lbl, color: '#aaa' }}>Starting Weight (lbs in)</label>
              <p style={{ margin: '0 0 4px', color: '#6b7280', fontSize: 10 }}>Raw fish received from fisherman</p>
              <input
                type="number"
                placeholder="0.0"
                value={weightIn}
                onChange={(e) => setWeightIn(e.target.value)}
                style={{ ...inp, fontSize: 20, fontWeight: 'bold', textAlign: 'center' as const, marginBottom: 0, border: '2px solid #1e3a5f' }}
              />
              <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 10, textAlign: 'center' as const }}>lbs</p>
            </div>
            <div>
              <label style={{ ...lbl, color: '#4ade80' }}>Finished Weight (lbs out)</label>
              <p style={{ margin: '0 0 4px', color: '#6b7280', fontSize: 10 }}>After cleaning, filleting, portioning</p>
              <input
                type="number"
                placeholder="0.0"
                value={weightOut}
                onChange={(e) => setWeightOut(e.target.value)}
                style={{ ...inp, fontSize: 20, fontWeight: 'bold', textAlign: 'center' as const, marginBottom: 0, border: '2px solid #4ade8066' }}
              />
              <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 10, textAlign: 'center' as const }}>lbs</p>
            </div>
          </div>

          {/* LIVE YIELD CALCULATION */}
          {weightInNum > 0 && weightOutNum > 0 && (
            <div style={{ backgroundColor: '#060d1f', borderRadius: 12, padding: '14px 16px', border: '1px solid #4ade8044' }}>
              <p style={{ margin: '0 0 12px', color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>📊 LIVE YIELD CALCULATION</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div style={{ backgroundColor: '#0a1f0a', borderRadius: 10, padding: '12px 14px', textAlign: 'center' as const }}>
                  <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>YIELD %</p>
                  <p style={{ margin: '6px 0 0', color: yieldPct >= 50 ? '#4ade80' : '#f5c518', fontWeight: 'bold', fontSize: 28 }}>{yieldPct}%</p>
                  <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 10 }}>
                    {weightInNum - weightOutNum > 0 ? `${(weightInNum - weightOutNum).toFixed(1)} lbs lost in processing` : ''}
                  </p>
                </div>
                <div style={{ backgroundColor: '#001a2a', borderRadius: 10, padding: '12px 14px', textAlign: 'center' as const }}>
                  <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>TRUE COST / LB</p>
                  <p style={{ margin: '6px 0 0', color: '#60a5fa', fontWeight: 'bold', fontSize: 28 }}>${trueCostPerLb.toFixed(2)}</p>
                  <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 10 }}>
                    ${selectedOrder.total_cost.toFixed(2)} ÷ {weightOutNum} lbs
                  </p>
                </div>
              </div>

              {/* MARGIN PREVIEW */}
              {processingPricing && (
                <>
                  <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>MARKETPLACE PRICES FROM YIELD COST</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Nassau POS (38%)',    value: processingPricing.nassauPrice,    color: '#60a5fa' },
                      { label: 'Andros POS (43%)',    value: processingPricing.androsPrice,    color: '#a78bfa' },
                      { label: 'Online Market (25%)', value: processingPricing.onlinePrice,    color: '#4ade80' },
                      { label: 'Wholesale (12%)',     value: processingPricing.wholesalePrice, color: '#f5c518' },
                    ].map(ch => (
                      <div key={ch.label} style={{ backgroundColor: '#0d1f3c', borderRadius: 8, padding: '8px 10px' }}>
                        <p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>{ch.label}</p>
                        <p style={{ margin: '3px 0 0', color: ch.color, fontWeight: 'bold', fontSize: 15 }}>${ch.value.toFixed(2)}/lb</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {weightOutNum > weightInNum && weightInNum > 0 && (
            <div style={{ backgroundColor: '#2d0000', border: '1px solid #f87171', borderRadius: 10, padding: '10px 14px', marginTop: 10 }}>
              <p style={{ margin: 0, color: '#f87171', fontSize: 13 }}>⚠️ Finished weight cannot exceed starting weight</p>
            </div>
          )}
        </div>

        {/* LINK TO SPINY TAILS PRODUCT */}
        <div style={card}>
          <p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>🔗 Link to Marketplace Product</p>
          <p style={{ margin: '0 0 12px', color: '#4a5568', fontSize: 12 }}>
            Link this batch to a Spiny Tails product so the yield-based cost updates the marketplace price for Dedrick to review.
          </p>
          <label style={lbl}>Spiny Tails Product (optional)</label>
          <select
            value={linkedProductId}
            onChange={(e) => setLinkedProductId(e.target.value)}
            style={inp}
          >
            <option value="">— No link / record yield only —</option>
            {spinyProducts.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} {p.case_cost > 0 ? `· Current cost: $${p.case_cost.toFixed(2)}/lb` : '· (no cost set)'}
              </option>
            ))}
          </select>

          {linkedProductId && processingPricing && (
            <div style={{ backgroundColor: '#1a1400', border: '1px solid #f5c518', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 12 }}>⚠️ PENDING REVIEW — Not live yet</p>
              <p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>
                Saving will set this product to PENDING. Dedrick must approve in the Supplier Portal → Spiny Tails → Products tab before prices go live on the marketplace.
              </p>
            </div>
          )}

          <label style={{ ...lbl, marginTop: 12 }}>Processing Notes (optional)</label>
          <input
            placeholder="e.g. Grouper batch, good quality, slight ice damage on 2 fish"
            value={processingNote}
            onChange={(e) => setProcessingNote(e.target.value)}
            style={{ ...inp, marginBottom: 0 }}
          />
        </div>

        {error && (
          <div style={{ backgroundColor: '#2d0000', border: '1px solid #f87171', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
            <p style={{ margin: 0, color: '#f87171', fontSize: 13 }}>{error}</p>
          </div>
        )}

        <button
          onClick={handleSaveProcessing}
          disabled={savingProcessing || weightInNum <= 0 || weightOutNum <= 0 || weightOutNum > weightInNum}
          style={{
            ...primaryBtn,
            backgroundColor: savingProcessing || weightInNum <= 0 || weightOutNum <= 0 ? '#2a2a2a' : '#f5c518',
            color: weightInNum <= 0 || weightOutNum <= 0 ? '#555' : '#000',
            cursor: savingProcessing || weightInNum <= 0 || weightOutNum <= 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {savingProcessing
            ? '⏳ Saving...'
            : linkedProductId
              ? '✅ Save Yield & Send for Price Review'
              : '✅ Save Yield Data'}
        </button>
        <button onClick={() => { setScreen('list'); setSelectedOrder(null); setError(''); }} style={secondaryBtn}>Cancel</button>
      </div>
    );
  }

  // ── NEW PO SCREEN ──
  if (screen === 'new') return (
    <div style={pg}>
      <BSCControlBack />
      <button onClick={() => setScreen('list')} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 14, cursor: 'pointer', marginBottom: 14, padding: 0 }}>← Back</button>
      <h2 style={{ margin: '0 0 4px', color: '#f5c518', fontSize: 20 }}>📸 New Purchase Order</h2>
      <p style={{ margin: '0 0 20px', color: '#4a5568', fontSize: 13 }}>Fisherman delivery · Snap invoice or enter manually</p>

      {success && (
        <div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 12, padding: '14px 16px', marginBottom: 16, textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>✅ {success}</p>
        </div>
      )}

      <div style={card}>
        <label style={lbl}>Supplier / Fisherman Name</label>
        <input placeholder="e.g. Captain Roy, Nassau Fish Market..." value={supplierName} onChange={(e) => setSupplierName(e.target.value)} style={inp} />
        <label style={lbl}>Recorded By</label>
        <select value={allocatedBy} onChange={(e) => setAllocatedBy(e.target.value)} style={inp}>
          <option>Dedrick Storr</option>
          <option>Ashley Rolle</option>
        </select>
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 12px', color: '#60a5fa', fontWeight: 'bold', fontSize: 13 }}>📷 Invoice Photo (AI will read it)</p>
        <div onClick={() => document.getElementById('poPhotoInput')?.click()} style={{ width: '100%', height: photoPreview ? 200 : 130, borderRadius: 12, border: '2px dashed ' + (photoPreview ? '#4ade80' : '#1e3a5f'), display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', backgroundColor: '#060d1f', marginBottom: 10 }}>
          {photoPreview
            ? <img src={photoPreview} alt="Invoice" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : (
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 32 }}>📷</p>
                <p style={{ margin: '8px 0 0', color: '#4a5568', fontSize: 13 }}>Tap to photograph invoice</p>
                <p style={{ margin: '4px 0 0', color: '#2a3a5a', fontSize: 11 }}>AI will extract all line items automatically</p>
              </div>
            )}
        </div>
        <input id="poPhotoInput" type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handlePhotoUpload(file); }} />
        {photoPreview && <button onClick={() => { setPhoto(null); setPhotoPreview(''); setAiSummary(''); setAiItems([]); }} style={{ ...secondaryBtn, marginBottom: 0 }}>Remove Photo</button>}
      </div>

      {aiLoading && (
        <div style={{ ...card, textAlign: 'center', padding: 24 }}>
          <p style={{ margin: '0 0 8px', fontSize: 32 }}>🤖</p>
          <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>AI Reading Invoice...</p>
          <p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 12 }}>Extracting line items and costs</p>
        </div>
      )}

      {!aiLoading && aiItems.length > 0 && !useManual && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>🤖 AI Extracted {aiItems.length} Items</p>
            <button onClick={() => setUseManual(true)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer' }}>Edit Manually</button>
          </div>
          {aiSummary && <p style={{ margin: '0 0 12px', color: '#aaa', fontSize: 12, fontStyle: 'italic' }}>{aiSummary}</p>}
          {aiItems.map((item, i) => (
            <div key={i} style={{ backgroundColor: '#060d1f', borderRadius: 10, padding: '10px 12px', marginBottom: 8, border: '1px solid #1e3a5f' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{item.name}</p>
                  <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>{item.cases} cases {item.totalLbs > 0 && '· ' + item.totalLbs + ' lbs'}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>${item.totalCost.toFixed(2)}</p>
                  <p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>${item.costPerCase.toFixed(2)}/cs</p>
                </div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #1e3a5f' }}>
            <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>Total Cost</p>
            <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>${totalCost.toFixed(2)}</p>
          </div>
        </div>
      )}

      {(useManual || (!aiLoading && aiItems.length === 0 && !photo)) && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>📝 Manual Item Entry</p>
            {useManual && aiItems.length > 0 && <button onClick={() => setUseManual(false)} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}>Use AI Results</button>}
          </div>
          {manualItems.map((item, i) => (
            <div key={i} style={{ backgroundColor: '#060d1f', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #1e3a5f' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 11 }}>Item {i + 1}</p>
                {manualItems.length > 1 && <button onClick={() => removeManualItem(i)} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 12, cursor: 'pointer' }}>Remove</button>}
              </div>
              <input placeholder="Product name *" value={item.name} onChange={(e) => updateManualItem(i, 'name', e.target.value)} style={inp} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={lbl}>Total Cost Paid ($)</label>
                  <input type="number" placeholder="0.00" value={item.costPerCase || ''} onChange={(e) => updateManualItem(i, 'costPerCase', parseFloat(e.target.value) || 0)} style={{ ...inp, marginBottom: 0 }} />
                </div>
                <div>
                  <label style={lbl}>Cases / Bags</label>
                  <input type="number" placeholder="0" value={item.cases || ''} onChange={(e) => updateManualItem(i, 'cases', parseFloat(e.target.value) || 0)} style={{ ...inp, marginBottom: 0 }} />
                </div>
                <div>
                  <label style={lbl}>Unit Description</label>
                  <input placeholder="e.g. whole fish, on ice" value={item.unitDescription} onChange={(e) => updateManualItem(i, 'unitDescription', e.target.value)} style={{ ...inp, marginBottom: 0 }} />
                </div>
                <div>
                  <label style={lbl}>Approx. Weight (lbs)</label>
                  <input type="number" placeholder="0" value={item.totalLbs || ''} onChange={(e) => updateManualItem(i, 'totalLbs', parseFloat(e.target.value) || 0)} style={{ ...inp, marginBottom: 0 }} />
                </div>
              </div>
              {item.costPerCase > 0 && <p style={{ margin: '8px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>Total: ${(item.cases > 0 ? item.cases * item.costPerCase : item.costPerCase).toFixed(2)}</p>}
            </div>
          ))}
          <button onClick={addManualItem} style={{ ...secondaryBtn, borderColor: '#f5c518', color: '#f5c518' }}>+ Add Another Item</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #1e3a5f' }}>
            <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>Total Cost</p>
            <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>${totalCost.toFixed(2)}</p>
          </div>
        </div>
      )}

      {(aiItems.length > 0 || manualItems[0]?.name) && (
        <div style={card}>
          <p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>📊 Allocate Cases</p>
          <p style={{ margin: '0 0 14px', color: '#4a5568', fontSize: 12 }}>
            Total: <b style={{ color: '#fff' }}>{totalCases} cases</b> · Allocated: <b style={{ color: unallocated === 0 ? '#4ade80' : '#f87171' }}>{allocatedCases}</b> · Remaining: <b style={{ color: unallocated === 0 ? '#4ade80' : '#f87171' }}>{unallocated}</b>
          </p>
          {([
            { key: 'retail_physical'    as keyof Allocation, label: 'Retail — Physical Store',  icon: '🏬', color: '#4ade80' },
            { key: 'retail_online'      as keyof Allocation, label: 'Retail — Online Market',   icon: '🌐', color: '#60a5fa' },
            { key: 'wholesale_physical' as keyof Allocation, label: 'Wholesale — Physical',     icon: '📦', color: '#f5c518' },
            { key: 'wholesale_online'   as keyof Allocation, label: 'Wholesale — US/Online',    icon: '🇺🇸', color: '#a78bfa' },
          ] as { key: keyof Allocation; label: string; icon: string; color: string }[]).map(ch => (
            <div key={ch.key} style={{ backgroundColor: '#060d1f', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #1e3a5f' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ margin: 0, color: ch.color, fontWeight: 'bold', fontSize: 13 }}>{ch.icon} {ch.label}</p>
                <p style={{ margin: 0, color: ch.color, fontWeight: 'bold', fontSize: 14 }}>{allocation[ch.key]} cases</p>
              </div>
              <input type="number" min={0} value={allocation[ch.key] || ''} onChange={(e) => setAllocation(prev => ({ ...prev, [ch.key]: parseInt(e.target.value) || 0 }))} style={{ ...inp, marginBottom: 0, fontSize: 16, fontWeight: 'bold' }} />
            </div>
          ))}
          {unallocated !== 0 && (
            <div style={{ backgroundColor: unallocated > 0 ? '#1a1400' : '#2d0000', border: '1px solid ' + (unallocated > 0 ? '#f5c518' : '#f87171'), borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ margin: 0, color: unallocated > 0 ? '#f5c518' : '#f87171', fontSize: 13 }}>
                {unallocated > 0 ? `⚠️ ${unallocated} cases unallocated` : `⚠️ Over-allocated by ${Math.abs(unallocated)} cases`}
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ backgroundColor: '#2d0000', border: '1px solid #f87171', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ margin: 0, color: '#f87171', fontSize: 13 }}>{error}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={processing || !supplierName || (aiItems.length === 0 && !manualItems[0]?.name)}
        style={{ ...primaryBtn, backgroundColor: processing ? '#555' : '#f5c518', cursor: processing ? 'not-allowed' : 'pointer' }}
      >
        {processing ? '⏳ Saving...' : '✅ Save Purchase Order'}
      </button>
      <button onClick={() => setScreen('list')} style={secondaryBtn}>Cancel</button>
    </div>
  );

  return null;
}
