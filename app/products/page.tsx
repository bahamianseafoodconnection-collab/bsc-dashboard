'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { calculatePrice, BSC_PRICING_RULES, type PricingChannel } from '@/lib/pricing';
import { priceCartLine, type ProductPriceSnapshot, type CartLinePricing } from '@/lib/cart-pricing';

let _supabase: ReturnType<typeof createBrowserClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

const FOUNDER_ID = '7b62672c-9259-4c1b-98d4-3b78369a52ab';

const CHANNELS = [
  { key: 'nassau_pos',     label: 'Nassau POS',    emoji: '🟡', margin: 0.38 },
  { key: 'andros_pos',     label: 'Andros POS',    emoji: '🟣', margin: 0.43 },
  { key: 'online_market',  label: 'Online Market', emoji: '🛒', margin: 0.25 },
  { key: 'local_wholesale',label: 'Wholesale',     emoji: '📦', margin: 0.15 },
];

// Per-channel sell-price math.
//   Nassau / Andros / Wholesale: sell = cost / (1 - margin)
//   Online Market:               sell = cost / (1 - margin)
// Reverse (cost from a typed sell price) is the inverse.
function chSellFromCost(channel: string, cost: number): number {
  switch (channel) {
    case 'nassau_pos':      return cost / 0.62;
    case 'andros_pos':      return cost / 0.57;
    case 'online_market':   return cost / 0.75;
    case 'local_wholesale': return cost / 0.85;
    default:                return cost;
  }
}
function chCostFromSell(channel: string, sell: number): number {
  switch (channel) {
    case 'nassau_pos':      return sell * 0.62;
    case 'andros_pos':      return sell * 0.57;
    case 'online_market':   return sell * 0.75;
    case 'local_wholesale': return sell * 0.85;
    default:                return sell;
  }
}

const CATEGORIES = [
  'fresh_seafood','frozen_seafood','processed_seafood',
  'meat','poultry','produce','grocery','beverage',
  'juice_smoothie','wellness_shot','snack','household','toiletry','other',
];

const CATEGORY_LABELS: Record<string, string> = {
  fresh_seafood: 'Fresh Seafood', frozen_seafood: 'Frozen Seafood',
  processed_seafood: 'Processed Seafood', meat: 'Meat', poultry: 'Poultry',
  produce: 'Produce', grocery: 'Grocery', beverage: 'Beverage',
  juice_smoothie: 'Juice/Smoothie', wellness_shot: 'Wellness Shot',
  snack: 'Snack', household: 'Household', toiletry: 'Toiletry', other: 'Other',
};

interface Supplier {
  id: string;
  name: string;
  code: string;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  is_bsc_processed: boolean;
  unit_type: string | null;
  unit_of_measure: string | null;
  status: string;
  sell_nassau: boolean;
  sell_andros: boolean;
  sell_online: boolean;
  sell_wholesale: boolean;
  image_url: string | null;
  primary_supplier_id: string | null;
  supplier_sku: string | null;
  pricing: Record<string, number>;
}

interface NewProduct {
  sku: string;
  name: string;
  description: string;
  category: string;
  is_bsc_processed: boolean;
  unit_type: string;
  sell_nassau: boolean;
  sell_andros: boolean;
  sell_online: boolean;
  sell_wholesale: boolean;
  cost_per_unit: string;
  prices: Record<string, string>;
  image_file: File | null;
  image_preview: string;
  primary_supplier_id: string;
  supplier_sku: string;
}

const BLANK_NEW: NewProduct = {
  sku: '', name: '', description: '', category: 'fresh_seafood',
  is_bsc_processed: false, unit_type: 'each',
  sell_nassau: true, sell_andros: false, sell_online: true, sell_wholesale: false,
  cost_per_unit: '',
  prices: { nassau_pos: '', andros_pos: '', online_market: '', local_wholesale: '' },
  image_file: null, image_preview: '',
  primary_supplier_id: '', supplier_sku: '',
};

export default function ProductsPage() {
  const supabase = getSupabase();
  const [products, setProducts]               = useState<Product[]>([]);
  const [suppliers, setSuppliers]             = useState<Supplier[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [search, setSearch]                   = useState('');
  const [filterCat, setFilterCat]             = useState('all');
  const [filterChan, setFilterChan]           = useState('all');
  const [selected, setSelected]               = useState<Product | null>(null);
  const [editPrices, setEditPrices]           = useState<Record<string, string>>({});
  const [editCost, setEditCost]               = useState<string>('');
  const [editChannels, setEditChannels]       = useState<Record<string, boolean>>({});
  const [editImageFile, setEditImageFile]     = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState('');
  const [editSupplierId, setEditSupplierId]   = useState('');
  const [editSupplierSku, setEditSupplierSku] = useState('');
  const [saving, setSaving]                   = useState(false);
  const [newProduct, setNewProduct]           = useState<NewProduct>(BLANK_NEW);
  const [adding, setAdding]                   = useState(false);
  const [toast, setToast]                     = useState<{ msg: string; ok: boolean } | null>(null);
  const [tab, setTab]                         = useState<'list' | 'add'>('list');

  // ── Quick Sale state ─────────────────────────────────────────────
  type SaleLine = { product: Product; quantity: number; weight_lb?: number };
  type SaleChannel  = 'nassau_pos' | 'andros_pos' | 'online_retail' | 'wholesale';
  type SalePayment  = 'cash' | 'card' | 'wire';
  type SaleCustomer = { id: string; full_name: string; phone: string | null; email: string | null; email_marketing_consent: boolean | null; total_orders: number; total_spent: number };
  const [saleOpen,         setSaleOpen]         = useState(false);
  const [saleCart,         setSaleCart]         = useState<SaleLine[]>([]);
  const [saleChannel,      setSaleChannel]      = useState<SaleChannel>('nassau_pos');
  const [saleWeightInput,  setSaleWeightInput]  = useState<{ productId: string; weight: string } | null>(null);
  const [salePhone,        setSalePhone]        = useState('');
  const [saleName,         setSaleName]         = useState('');
  const [saleEmail,        setSaleEmail]        = useState('');
  const [saleConsent,      setSaleConsent]      = useState(false);
  const [saleFoundCust,    setSaleFoundCust]    = useState<SaleCustomer | null>(null);
  const [saleStatus,       setSaleStatus]       = useState<'idle' | 'found' | 'new' | 'looking'>('idle');
  const [salePayment,      setSalePayment]      = useState<SalePayment>('cash');
  const [saleCashTendered, setSaleCashTendered] = useState('');
  const [saleSubmitting,   setSaleSubmitting]   = useState(false);
  const salePhoneTimer = useRef<NodeJS.Timeout | null>(null);

  // Per-line pricing — recomputed every render so quantity bumps that
  // cross 10 lbs auto-flip to wholesale immediately.
  function saleLineInfo(line: SaleLine): { count: number; pricing: CartLinePricing; line_subtotal: number } {
    const retailKey =
      saleChannel === 'andros_pos'    ? 'andros_pos'    :
      saleChannel === 'online_retail' ? 'online_market' :
      saleChannel === 'wholesale'     ? 'local_wholesale' :
      'nassau_pos';
    const retailSnap = line.product.pricing[retailKey] ?? line.product.pricing['nassau_pos'] ?? 0;
    const wholesaleSnap = line.product.pricing['local_wholesale'] ?? null;
    const snap: ProductPriceSnapshot = {
      retail_price:    retailSnap,
      // When admin explicitly selected wholesale channel, the retail field IS wholesale.
      // Otherwise expose the local_wholesale snapshot for auto-upgrade at 10+ lbs.
      wholesale_price: saleChannel === 'wholesale' ? null : wholesaleSnap,
      promo_price:     null,
    };
    const isLb    = line.product.unit_type === 'lb';
    const count   = line.weight_lb && line.weight_lb > 0 ? line.weight_lb : line.quantity;
    const pricing = priceCartLine(snap, count, isLb ? 'lb' : 'each');
    return { count, pricing, line_subtotal: Math.round(pricing.unit_price * count * 100) / 100 };
  }

  const saleSubtotal = saleCart.reduce((s, l) => s + saleLineInfo(l).line_subtotal, 0);
  const saleVat      = 0;  // matches /pos for now — food items are zero-rated at POS
  const saleTotal    = saleSubtotal + saleVat;
  const saleCount    = saleCart.reduce((s, l) => s + l.quantity, 0);

  function addToSale(product: Product, weightLb?: number) {
    const isLb = product.unit_type === 'lb';
    if (isLb && !weightLb) {
      setSaleWeightInput({ productId: product.id, weight: '' });
      return;
    }
    setSaleCart(prev => {
      if (!isLb) {
        const idx = prev.findIndex(l => l.product.id === product.id);
        if (idx > -1) return prev.map((l, i) => i === idx ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...prev, { product, quantity: 1, weight_lb: weightLb }];
    });
    setSaleWeightInput(null);
    setSaleOpen(true);
  }
  function removeFromSale(idx: number)         { setSaleCart(prev => prev.filter((_, i) => i !== idx)); }
  function adjustSaleQty(idx: number, delta: number) {
    setSaleCart(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const q = l.quantity + delta;
      return q <= 0 ? null : { ...l, quantity: q };
    }).filter(Boolean) as SaleLine[]);
  }
  function confirmSaleWeight() {
    if (!saleWeightInput) return;
    const p = products.find(x => x.id === saleWeightInput.productId);
    const lbs = parseFloat(saleWeightInput.weight);
    if (!p || isNaN(lbs) || lbs <= 0) return;
    addToSale(p, lbs);
  }

  // Phone normalize — mirror of bsc_normalize_phone for write-time E.164.
  function saleNormalizePhone(raw: string): string | null {
    if (!raw || !raw.trim()) return null;
    let c = raw.replace(/[^0-9+]/g, '');
    if (c.startsWith('+')) return c;
    c = c.replace(/\+/g, '');
    if (c.length === 7) return `+1242${c}`;
    if (c.length === 10) return `+1${c}`;
    if (c.length === 11 && c.startsWith('1')) return `+${c}`;
    return c ? `+${c}` : null;
  }

  function handleSalePhoneChange(val: string) {
    setSalePhone(val);
    setSaleFoundCust(null);
    setSaleStatus('idle');
    setSaleName(''); setSaleEmail(''); setSaleConsent(false);
    if (salePhoneTimer.current) clearTimeout(salePhoneTimer.current);
    if (val.length < 7) return;
    setSaleStatus('looking');
    salePhoneTimer.current = setTimeout(async () => {
      const { data: matches } = await supabase.rpc('bsc_lookup_customer_by_phone', { p_raw_phone: val.trim() });
      const match = Array.isArray(matches) && matches.length > 0 ? matches[0] : null;
      if (!match) { setSaleStatus('new'); return; }
      const { data: full } = await supabase
        .from('customers')
        .select('id, full_name, phone, email, email_marketing_consent, total_orders, total_spent')
        .eq('id', match.id)
        .maybeSingle();
      const row = (full ?? { ...match, total_orders: 0, total_spent: 0 }) as SaleCustomer;
      setSaleFoundCust(row);
      setSaleName(row.full_name);
      setSaleEmail(row.email ?? '');
      setSaleConsent(Boolean(row.email_marketing_consent));
      setSaleStatus('found');
    }, 350);
  }

  function resetSale() {
    setSaleCart([]);
    setSalePhone(''); setSaleName(''); setSaleEmail(''); setSaleConsent(false);
    setSaleFoundCust(null); setSaleStatus('idle');
    setSalePayment('cash'); setSaleCashTendered('');
  }

  async function handleSaleCharge() {
    if (saleCart.length === 0) return;
    const tendered = parseFloat(saleCashTendered) || 0;
    if (salePayment === 'cash' && tendered < saleTotal) {
      alert(`Cash tendered ($${tendered.toFixed(2)}) is less than total ($${saleTotal.toFixed(2)}).`);
      return;
    }
    setSaleSubmitting(true);
    try {
      const phoneClean = salePhone.trim();
      const nameClean  = saleName.trim();
      const emailClean = saleEmail.trim().toLowerCase();
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean) ? emailClean : '';
      const normalized = saleNormalizePhone(phoneClean);

      let customerId: string | null = null;
      if (phoneClean && nameClean) {
        if (saleFoundCust) {
          const updates: Record<string, unknown> = {
            last_seen_at: new Date().toISOString(),
            total_orders: saleFoundCust.total_orders + 1,
            total_spent:  Number(saleFoundCust.total_spent) + saleTotal,
          };
          if (normalized) updates.phone_e164 = normalized;
          if (validEmail) updates.email = validEmail;
          if (saleConsent && validEmail && !saleFoundCust.email_marketing_consent) {
            updates.email_marketing_consent = true;
            updates.email_consent_at        = new Date().toISOString();
            updates.email_consent_source    = saleChannel;
          }
          await supabase.from('customers').update(updates).eq('id', saleFoundCust.id);
          customerId = saleFoundCust.id;
        } else {
          const consentNow = saleConsent && !!validEmail;
          const originForChannel: string =
            saleChannel === 'andros_pos'    ? 'andros_pos' :
            saleChannel === 'online_retail' ? 'online'     :
            saleChannel === 'wholesale'     ? 'wholesale'  :
            'nassau_pos';
          const { data: newCust } = await supabase.from('customers').insert({
            full_name:      nameClean,
            phone:          phoneClean,
            phone_e164:     normalized,
            origin_channel: originForChannel,
            email:          validEmail || null,
            email_marketing_consent: consentNow,
            email_consent_at:     consentNow ? new Date().toISOString() : null,
            email_consent_source: consentNow ? originForChannel : null,
            total_orders: 1, total_spent: saleTotal,
            created_by: FOUNDER_ID,
          }).select('id').single();
          customerId = newCust?.id ?? null;
        }
      }

      const items = saleCart.map(line => {
        const { pricing, line_subtotal } = saleLineInfo(line);
        return {
          product_id: line.product.id, sku: line.product.sku, name: line.product.name,
          quantity:   line.quantity,
          unit_price: pricing.unit_price,
          weight_lb:  line.weight_lb ?? null,
          line_total: line_subtotal,
          applied_channel:       pricing.applied_channel,
          upgraded_to_wholesale: pricing.upgraded_to_wholesale,
        };
      });

      const orderTypeMap: Record<SaleChannel, string> = {
        nassau_pos:    'pos_sale_nassau',
        andros_pos:    'pos_sale_andros',
        online_retail: 'online',
        wholesale:     'wholesale',
      };
      const locationMap: Record<SaleChannel, string> = {
        nassau_pos:    'bsc_marketplace_nassau',
        andros_pos:    'bsc_andros',
        online_retail: 'online',
        wholesale:     'bsc_marketplace_nassau',
      };
      const channelMap: Record<SaleChannel, string> = {
        nassau_pos:    'nassau_pos',
        andros_pos:    'andros_pos',
        online_retail: 'online_retail',
        wholesale:     'local_wholesale',
      };

      let adminNotes = `Admin Quick Sale via /products`;
      if (salePayment === 'cash') {
        const change = Math.max(0, tendered - saleTotal);
        adminNotes += ` · Cash tendered: $${tendered.toFixed(2)} · Change: $${change.toFixed(2)}`;
      }

      const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({
        order_type:     orderTypeMap[saleChannel],
        location:       locationMap[saleChannel],
        channel:        channelMap[saleChannel],
        wholesale_items: items,
        subtotal:       saleSubtotal, vat_amount: saleVat, total: saleTotal,
        payment_method: salePayment,
        payment_status: 'paid_in_full',
        admin_notes:    adminNotes,
        status:         'completed',
        customer_id:    customerId,
        customer_name:  nameClean || null,
        customer_phone: phoneClean || null,
      }).select('id').single();
      if (orderErr) throw orderErr;

      const orderId = newOrder?.id;
      if (orderId) window.open(`/receipt/${orderId}`, '_blank');

      setSaleSubmitting(false);
      resetSale();
      setSaleOpen(false);
      setToast({ msg: '✓ Sale completed', ok: true });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setSaleSubmitting(false);
      alert('Order failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  // 3 image-source refs per form: Files / Gallery / Camera. All three write to
  // the same state — only the input element's `accept` + `capture` attributes
  // change what the browser surfaces to the user.
  const newFileRef    = useRef<HTMLInputElement>(null);
  const newGalleryRef = useRef<HTMLInputElement>(null);
  const newCameraRef  = useRef<HTMLInputElement>(null);
  const editFileRef    = useRef<HTMLInputElement>(null);
  const editGalleryRef = useRef<HTMLInputElement>(null);
  const editCameraRef  = useRef<HTMLInputElement>(null);

  // Legacy refs — some downstream callers still reference these names.
  const newImageRef  = newGalleryRef;
  const editImageRef = editGalleryRef;

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');
    setSuppliers(data ?? []);
  }, [supabase]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const { data: prods } = await supabase
      .from('products')
      .select('id, sku, name, description, category, is_bsc_processed, unit_type, unit_of_measure, status, sell_nassau, sell_andros, sell_online, sell_wholesale, image_url, primary_supplier_id, supplier_sku')
      .in('status', ['active', 'draft', 'pending_approval'])
      .order('name');

    const { data: pricing } = await supabase
      .from('product_pricing')
      .select('product_id, channel, manual_unit_price')
      .eq('is_current', true)
      .eq('is_active', true);

    const priceMap: Record<string, Record<string, number>> = {};
    for (const row of pricing ?? []) {
      if (!priceMap[row.product_id]) priceMap[row.product_id] = {};
      priceMap[row.product_id][row.channel] = Number(row.manual_unit_price);
    }

    setProducts((prods ?? []).map((p: any) => ({ ...p, pricing: priceMap[p.id] ?? {} })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadProducts();
    loadSuppliers();
  }, [loadProducts, loadSuppliers]);

  function openProduct(p: Product) {
    setSelected(p);
    setEditPrices({
      nassau_pos:      String(p.pricing['nassau_pos']      ?? ''),
      andros_pos:      String(p.pricing['andros_pos']      ?? ''),
      online_market:   String(p.pricing['online_market']   ?? ''),
      local_wholesale: String(p.pricing['local_wholesale'] ?? ''),
    });
    setEditChannels({
      nassau_pos:      p.sell_nassau,
      andros_pos:      p.sell_andros,
      online_market:   p.sell_online,
      local_wholesale: p.sell_wholesale,
    });
    setEditImageFile(null);
    setEditImagePreview('');
    setEditSupplierId(p.primary_supplier_id ?? '');
    setEditSupplierSku(p.supplier_sku ?? '');
    // Seed edit cost from any one channel's price (back-calc — use Nassau if available).
    const seedFrom = p.pricing['nassau_pos'] ?? p.pricing['online_market'] ?? p.pricing['andros_pos'] ?? p.pricing['local_wholesale'];
    if (seedFrom != null && Number(seedFrom) > 0) {
      const seedChan = p.pricing['nassau_pos'] != null ? 'nassau_pos'
                     : p.pricing['online_market'] != null ? 'online_market'
                     : p.pricing['andros_pos'] != null ? 'andros_pos'
                     : 'local_wholesale';
      setEditCost(chCostFromSell(seedChan, Number(seedFrom)).toFixed(2));
    } else {
      setEditCost('');
    }
  }

  // Auto-fill all 4 channel prices from a cost string. Returns the new
  // prices map; caller decides what to do (overwrite or merge).
  function pricesFromCost(cost: string, current: Record<string, string>): Record<string, string> {
    const c = parseFloat(cost);
    if (isNaN(c) || c <= 0) return current;
    return {
      ...current,
      nassau_pos:      chSellFromCost('nassau_pos',      c).toFixed(2),
      andros_pos:      chSellFromCost('andros_pos',      c).toFixed(2),
      online_market:   chSellFromCost('online_market',   c).toFixed(2),
      local_wholesale: chSellFromCost('local_wholesale', c).toFixed(2),
    };
  }

  // User typed in one channel's price → back-calc cost, then re-fill the OTHER
  // 3 channel prices from that cost. Source channel keeps the user's exact
  // input so they aren't fighting the calculator.
  function recalcFromChannelPrice(
    channel: string,
    sellStr: string,
    current: Record<string, string>,
  ): { cost: string; prices: Record<string, string> } {
    const s = parseFloat(sellStr);
    if (isNaN(s) || s <= 0) {
      return { cost: '', prices: { ...current, [channel]: sellStr } };
    }
    const cost = chCostFromSell(channel, s);
    const filled = pricesFromCost(cost.toFixed(2), current);
    return { cost: cost.toFixed(2), prices: { ...filled, [channel]: sellStr } };
  }

  // Back-compat shim for any callers that still pass `calcFromCost`.
  function calcFromCost(cost: string, setter: (p: Record<string, string>) => void, current: Record<string, string>) {
    const next = pricesFromCost(cost, current);
    if (next !== current) setter(next);
  }

  async function uploadImage(file: File, sku: string): Promise<string | null> {
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `products/${sku.toLowerCase()}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('site-images')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) { showToast('Image upload failed: ' + error.message, false); return null; }
    const { data } = supabase.storage.from('site-images').getPublicUrl(path);
    return data.publicUrl;
  }

  async function saveProduct() {
    if (!selected) return;
    setSaving(true);
    try {
      let imageUrl = selected.image_url;
      if (editImageFile) {
        const url = await uploadImage(editImageFile, selected.sku);
        if (url) imageUrl = url;
      }

      await supabase.from('products').update({
        sell_nassau:         editChannels['nassau_pos'],
        sell_andros:         editChannels['andros_pos'],
        sell_online:         editChannels['online_market'],
        sell_wholesale:      editChannels['local_wholesale'],
        image_url:           imageUrl,
        primary_supplier_id: editSupplierId || null,
        supplier_sku:        editSupplierSku.trim() || null,
      }).eq('id', selected.id);

      for (const ch of CHANNELS) {
        const price = parseFloat(editPrices[ch.key]);
        if (isNaN(price) || price <= 0) continue;
        await supabase.from('product_pricing').delete()
          .eq('product_id', selected.id).eq('channel', ch.key);
        await supabase.from('product_pricing').insert({
          product_id: selected.id, channel: ch.key,
          pricing_mode: 'manual', manual_unit_price: price,
          is_current: true, is_active: true,
          recorded_by: FOUNDER_ID, recorded_at: new Date().toISOString(),
        });
      }

      showToast('✓ Product updated');
      setSelected(null);
      loadProducts();
    } catch (err: any) {
      showToast('Save failed: ' + err.message, false);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddProduct() {
    if (!newProduct.name.trim() || !newProduct.sku.trim()) {
      showToast('Name and SKU are required', false);
      return;
    }
    setAdding(true);
    try {
      let imageUrl: string | null = null;
      if (newProduct.image_file) {
        imageUrl = await uploadImage(newProduct.image_file, newProduct.sku);
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('products')
        .insert({
          sku:                 newProduct.sku.trim().toUpperCase(),
          name:                newProduct.name.trim(),
          description:         newProduct.description.trim() || null,
          category:            newProduct.category,
          is_bsc_processed:    newProduct.is_bsc_processed,
          unit_type:           newProduct.unit_type,
          unit_of_measure:     newProduct.unit_type,
          sell_nassau:         newProduct.sell_nassau,
          sell_andros:         newProduct.sell_andros,
          sell_online:         newProduct.sell_online,
          sell_wholesale:      newProduct.sell_wholesale,
          image_url:           imageUrl,
          primary_supplier_id: newProduct.primary_supplier_id || null,
          supplier_sku:        newProduct.supplier_sku.trim() || null,
          status:              'active',
          created_by:          FOUNDER_ID,
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      for (const ch of CHANNELS) {
        const price = parseFloat(newProduct.prices[ch.key]);
        if (isNaN(price) || price <= 0) continue;
        await supabase.from('product_pricing').insert({
          product_id: inserted.id, channel: ch.key,
          pricing_mode: 'manual', manual_unit_price: price,
          is_current: true, is_active: true,
          recorded_by: FOUNDER_ID, recorded_at: new Date().toISOString(),
        });
      }

      showToast('✓ Product added successfully');
      setNewProduct(BLANK_NEW);
      setTab('list');
      loadProducts();
    } catch (err: any) {
      showToast('Failed: ' + err.message, false);
    } finally {
      setAdding(false);
    }
  }

  const filtered = products.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat  = filterCat === 'all' || p.category === filterCat;
    const matchChan =
      filterChan === 'all' ||
      (filterChan === 'nassau_pos'      && p.sell_nassau) ||
      (filterChan === 'andros_pos'      && p.sell_andros) ||
      (filterChan === 'online_market'   && p.sell_online) ||
      (filterChan === 'local_wholesale' && p.sell_wholesale);
    return matchSearch && matchCat && matchChan;
  });

  const activeCount  = products.filter(p => p.status === 'active').length;
  const nassauCount  = products.filter(p => p.sell_nassau).length;
  const onlineCount  = products.filter(p => p.sell_online).length;
  const androsCount  = products.filter(p => p.sell_andros).length;
  const noImageCount = products.filter(p => !p.image_url).length;

  // Supplier selector component used in both add + edit
  function SupplierSection({
    supplierId, supplierSku,
    onSupplierChange, onSkuChange,
  }: {
    supplierId: string; supplierSku: string;
    onSupplierChange: (v: string) => void; onSkuChange: (v: string) => void;
  }) {
    const selectedSupplier = suppliers.find(s => s.id === supplierId);
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#f5c518' }}>
            Supplier (Internal Only)
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
            style={{ backgroundColor: '#1a2e5a', color: 'rgba(255,255,255,0.5)' }}>
            🔒 Never shown to customers
          </span>
        </div>

        <select value={supplierId} onChange={e => onSupplierChange(e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
          style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }}>
          <option value="">— No supplier assigned —</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
          ))}
        </select>

        {supplierId && (
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {selectedSupplier?.name} SKU / Item Code
            </label>
            <input value={supplierSku} onChange={e => onSkuChange(e.target.value)}
              placeholder="Supplier's own code for this product"
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white font-mono outline-none"
              style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
            <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Used on purchase orders and order fulfillment — not visible to customers
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#060d1f', fontFamily: "'DM Sans', sans-serif" }}>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl font-bold text-sm shadow-xl"
          style={{ backgroundColor: toast.ok ? '#16a34a' : '#dc2626', color: 'white' }}>
          {toast.msg}
        </div>
      )}

      <header className="sticky top-0 z-40 border-b px-4 py-3"
        style={{ backgroundColor: '#1a2e5a', borderColor: 'rgba(245,197,24,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-bold text-lg" style={{ color: '#f5c518' }}>Product Management</h1>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {activeCount} active · {nassauCount} Nassau · {onlineCount} Online · {androsCount} Andros
              {noImageCount > 0 && <span style={{ color: '#f5c518' }}> · {noImageCount} missing images</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSaleOpen(true)}
              className="relative px-3 py-2 rounded-xl font-bold text-sm"
              style={{ backgroundColor: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid rgba(245,197,24,0.4)' }}>
              🛒 Sell
              {saleCount > 0 && (
                <span className="absolute -top-1 -right-1 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center"
                  style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>{saleCount}</span>
              )}
            </button>
            <button onClick={() => setTab(tab === 'add' ? 'list' : 'add')}
              className="px-4 py-2 rounded-xl font-bold text-sm"
              style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
              {tab === 'add' ? '← Back' : '+ Add Product'}
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          {(['list', 'add'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold"
              style={tab === t
                ? { backgroundColor: '#f5c518', color: '#060d1f' }
                : { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
              {t === 'list' ? '📋 All Products' : '➕ Add New'}
            </button>
          ))}
        </div>
      </header>

      {/* ── ADD PRODUCT TAB ── */}
      {tab === 'add' && (
        <div className="p-4 max-w-xl mx-auto space-y-4">

          {/* Image upload — Files / Gallery / Camera */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#0f1f3d' }}>
            <input ref={newFileRef}    type="file" accept="image/*"                       className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setNewProduct(p => ({ ...p, image_file: f, image_preview: URL.createObjectURL(f) })); }} />
            <input ref={newGalleryRef} type="file" accept="image/*"                       className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setNewProduct(p => ({ ...p, image_file: f, image_preview: URL.createObjectURL(f) })); }} />
            <input ref={newCameraRef}  type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setNewProduct(p => ({ ...p, image_file: f, image_preview: URL.createObjectURL(f) })); }} />

            {newProduct.image_preview ? (
              <div className="relative">
                <img src={newProduct.image_preview} alt="Preview"
                  className="w-full object-cover" style={{ maxHeight: '240px' }} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-8"
                style={{ backgroundColor: '#1a2e5a' }}>
                <div className="text-5xl">📷</div>
                <p className="font-bold text-white text-sm">Add Product Photo</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Pick a source below</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 p-3" style={{ backgroundColor: '#0f1f3d' }}>
              <button type="button" onClick={() => newCameraRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl text-xs font-bold"
                style={{ backgroundColor: '#1a2e5a', color: '#f5c518', border: '1px solid rgba(245,197,24,0.25)' }}>
                <span className="text-xl">📸</span>
                <span>Camera</span>
              </button>
              <button type="button" onClick={() => newGalleryRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl text-xs font-bold"
                style={{ backgroundColor: '#1a2e5a', color: '#f5c518', border: '1px solid rgba(245,197,24,0.25)' }}>
                <span className="text-xl">🖼️</span>
                <span>Gallery</span>
              </button>
              <button type="button" onClick={() => newFileRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl text-xs font-bold"
                style={{ backgroundColor: '#1a2e5a', color: '#f5c518', border: '1px solid rgba(245,197,24,0.25)' }}>
                <span className="text-xl">📁</span>
                <span>Files</span>
              </button>
            </div>

            {newProduct.image_preview && (
              <div className="px-4 py-2 flex items-center justify-between border-t"
                style={{ borderColor: 'rgba(245,197,24,0.15)' }}>
                <span className="text-xs" style={{ color: '#4ade80' }}>✓ Photo selected</span>
                <button onClick={() => setNewProduct(p => ({ ...p, image_file: null, image_preview: '' }))}
                  className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Remove</button>
              </div>
            )}
          </div>

          {/* Product details */}
          <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: '#0f1f3d' }}>
            <h2 className="font-bold text-white">Product Details</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>BSC SKU *</label>
                <input value={newProduct.sku}
                  onChange={e => setNewProduct(p => ({ ...p, sku: e.target.value }))}
                  placeholder="e.g. LBTAIL-P3"
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white font-mono outline-none"
                  style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Unit Type</label>
                <select value={newProduct.unit_type}
                  onChange={e => setNewProduct(p => ({ ...p, unit_type: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                  style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }}>
                  <option value="each">Each (unit)</option>
                  <option value="lb">Per lb (weight)</option>
                  <option value="bag">Bag</option>
                  <option value="case">Case</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Product Name *</label>
              <input value={newProduct.name}
                onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Lobster Tail Premium #1"
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
            </div>

            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Description</label>
              <input value={newProduct.description}
                onChange={e => setNewProduct(p => ({ ...p, description: e.target.value }))}
                placeholder="Short description for online market"
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
            </div>

            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Category</label>
              <select value={newProduct.category}
                onChange={e => setNewProduct(p => ({ ...p, category: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ backgroundColor: '#1a2e5a' }}>
              <div>
                <p className="text-sm font-bold text-white">BSC Processed</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Processed at Spiny Tail</p>
              </div>
              <button onClick={() => setNewProduct(p => ({ ...p, is_bsc_processed: !p.is_bsc_processed }))}
                className="w-12 h-6 rounded-full transition-colors relative"
                style={{ backgroundColor: newProduct.is_bsc_processed ? '#f5c518' : '#374151' }}>
                <div className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ left: newProduct.is_bsc_processed ? '26px' : '4px' }} />
              </button>
            </div>
          </div>

          {/* Supplier — internal only */}
          <div className="rounded-2xl p-5" style={{ backgroundColor: '#0f1f3d' }}>
            <SupplierSection
              supplierId={newProduct.primary_supplier_id}
              supplierSku={newProduct.supplier_sku}
              onSupplierChange={v => setNewProduct(p => ({ ...p, primary_supplier_id: v }))}
              onSkuChange={v => setNewProduct(p => ({ ...p, supplier_sku: v }))}
            />
          </div>

          {/* Channels */}
          <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#0f1f3d' }}>
            <h2 className="font-bold text-white">Sales Channels</h2>
            {CHANNELS.map(ch => {
              const isOn =
                ch.key === 'nassau_pos'      ? newProduct.sell_nassau :
                ch.key === 'andros_pos'      ? newProduct.sell_andros :
                ch.key === 'online_market'   ? newProduct.sell_online :
                newProduct.sell_wholesale;
              return (
                <div key={ch.key} className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ backgroundColor: '#1a2e5a' }}>
                  <div>
                    <p className="text-sm font-bold text-white">{ch.emoji} {ch.label}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Margin: {(ch.margin * 100).toFixed(0)}%
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (ch.key === 'nassau_pos')      setNewProduct(p => ({ ...p, sell_nassau: !p.sell_nassau }));
                      if (ch.key === 'andros_pos')      setNewProduct(p => ({ ...p, sell_andros: !p.sell_andros }));
                      if (ch.key === 'online_market')   setNewProduct(p => ({ ...p, sell_online: !p.sell_online }));
                      if (ch.key === 'local_wholesale') setNewProduct(p => ({ ...p, sell_wholesale: !p.sell_wholesale }));
                    }}
                    className="w-12 h-6 rounded-full transition-colors relative"
                    style={{ backgroundColor: isOn ? '#f5c518' : '#374151' }}>
                    <div className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                      style={{ left: isOn ? '26px' : '4px' }} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Pricing — type in ANY field, the others auto-fill from channel margins */}
          <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#0f1f3d' }}>
            <h2 className="font-bold text-white">Pricing</h2>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Type either the cost OR any channel price — the rest auto-calculate from BSC margins
              (Nassau 38% · Andros 43% · Online 25% · Wholesale 15%).
            </p>
            <div className="rounded-xl px-4 py-3" style={{ backgroundColor: '#1a2e5a' }}>
              <label className="text-xs font-bold mb-2 block" style={{ color: '#f5c518' }}>
                Cost Per Unit
              </label>
              <input type="number" step="0.01" min="0" placeholder="e.g. 6.50"
                value={newProduct.cost_per_unit}
                onChange={e => {
                  const v = e.target.value;
                  setNewProduct(p => ({ ...p, cost_per_unit: v, prices: pricesFromCost(v, p.prices) }));
                }}
                className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
                style={{ backgroundColor: '#060d1f', border: '1px solid rgba(245,197,24,0.3)' }} />
            </div>
            {CHANNELS.map(ch => (
              <div key={ch.key}>
                <label className="text-xs font-bold mb-1 block" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {ch.emoji} {ch.label} Price (BSD $)
                </label>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={newProduct.prices[ch.key]}
                  onChange={e => {
                    const v = e.target.value;
                    setNewProduct(p => {
                      const { cost, prices } = recalcFromChannelPrice(ch.key, v, p.prices);
                      return { ...p, cost_per_unit: cost || p.cost_per_unit, prices };
                    });
                  }}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                  style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
              </div>
            ))}
          </div>

          <button onClick={handleAddProduct} disabled={adding}
            className="w-full py-4 rounded-2xl font-bold text-base disabled:opacity-50"
            style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
            {adding ? 'Adding…' : '➕ Add Product'}
          </button>
        </div>
      )}

      {/* ── PRODUCT LIST TAB ── */}
      {tab === 'list' && (
        <div className="p-4 space-y-3">
          <input type="search" placeholder="Search by name or SKU…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
            style={{ backgroundColor: '#0f1f3d', border: '1px solid rgba(245,197,24,0.2)' }} />

          <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
            {[{ key: 'all', label: 'All' }, ...CHANNELS].map(ch => (
              <button key={ch.key} onClick={() => setFilterChan(ch.key)}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold"
                style={filterChan === ch.key
                  ? { backgroundColor: '#f5c518', color: '#060d1f' }
                  : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
                {'emoji' in ch ? `${ch.emoji} ` : ''}{ch.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
            <button onClick={() => setFilterCat('all')}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold"
              style={filterCat === 'all'
                ? { backgroundColor: '#f5c518', color: '#060d1f' }
                : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
              All Categories
            </button>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setFilterCat(c)}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold"
                style={filterCat === c
                  ? { backgroundColor: '#f5c518', color: '#060d1f' }
                  : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{filtered.length} products</p>

          {loading ? (
            <div className="text-center py-12 text-sm animate-pulse" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Loading products…
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(p => {
                const supplier = suppliers.find(s => s.id === p.primary_supplier_id);
                return (
                  <div key={p.id} className="relative rounded-xl border transition"
                    style={{ backgroundColor: '#0f1f3d', borderColor: 'rgba(245,197,24,0.15)' }}>
                    {/* ➕ Add to sale — floating top-right, separate hit area from card body */}
                    <button onClick={(e) => { e.stopPropagation(); addToSale(p); }}
                      className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full text-base font-bold flex items-center justify-center z-10"
                      style={{ backgroundColor: '#f5c518', color: '#060d1f' }}
                      aria-label={`Add ${p.name} to sale`}
                      title="Add to sale">
                      🛒
                    </button>
                  <button onClick={() => openProduct(p)}
                    className="w-full text-left"
                    style={{ background: 'transparent' }}>
                    <div className="flex items-stretch">
                      <div className="shrink-0 w-20 h-20 rounded-l-xl overflow-hidden"
                        style={{ backgroundColor: '#1a2e5a' }}>
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                        )}
                      </div>
                      <div className="flex flex-1 items-start justify-between gap-3 p-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: '#1a2e5a', color: 'rgba(255,255,255,0.5)' }}>
                              {p.sku}
                            </span>
                            {p.is_bsc_processed && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900 text-blue-300">BSC</span>
                            )}
                            {p.unit_type === 'lb' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900 text-amber-300">/lb</span>
                            )}
                            {!p.image_url && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900 text-red-300">No image</span>
                            )}
                          </div>
                          <p className="text-sm font-bold text-white truncate">{p.name}</p>
                          {supplier && (
                            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                              🔒 {supplier.name}{p.supplier_sku ? ` · ${p.supplier_sku}` : ''}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="flex gap-1 flex-wrap justify-end mb-1">
                            {p.sell_nassau    && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-900 text-yellow-300">🟡</span>}
                            {p.sell_andros    && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900 text-purple-300">🟣</span>}
                            {p.sell_online    && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-900 text-blue-300">🛒</span>}
                            {p.sell_wholesale && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900 text-green-300">📦</span>}
                          </div>
                          <div className="text-xs space-y-0.5" style={{ color: '#f5c518' }}>
                            {p.sell_nassau  && p.pricing['nassau_pos']    && <div>${p.pricing['nassau_pos'].toFixed(2)}</div>}
                            {p.sell_online  && p.pricing['online_market']  && <div>${p.pricing['online_market'].toFixed(2)}</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── EDIT PRODUCT MODAL ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border overflow-y-auto"
            style={{ backgroundColor: '#0f1f3d', borderColor: 'rgba(245,197,24,0.2)', maxHeight: '92dvh' }}>

            <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b"
              style={{ backgroundColor: '#0f1f3d', borderColor: 'rgba(245,197,24,0.2)' }}>
              <div>
                <p className="font-bold text-white">{selected.name}</p>
                <p className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>{selected.sku}</p>
              </div>
              <button onClick={() => setSelected(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-lg"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'white' }}>×</button>
            </div>

            <div className="p-5 space-y-5">

              {/* Image — Files / Gallery / Camera */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#f5c518' }}>
                  Product Photo
                </h3>
                <input ref={editFileRef}    type="file" accept="image/*"                       className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setEditImageFile(f); setEditImagePreview(URL.createObjectURL(f)); } }} />
                <input ref={editGalleryRef} type="file" accept="image/*"                       className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setEditImageFile(f); setEditImagePreview(URL.createObjectURL(f)); } }} />
                <input ref={editCameraRef}  type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setEditImageFile(f); setEditImagePreview(URL.createObjectURL(f)); } }} />

                <div className="overflow-hidden rounded-xl"
                  style={{ backgroundColor: '#1a2e5a' }}>
                  {editImagePreview || selected.image_url ? (
                    <img src={editImagePreview || selected.image_url!} alt={selected.name}
                      className="w-full object-cover" style={{ maxHeight: '200px' }} />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-6">
                      <div className="text-3xl">📷</div>
                      <p className="text-sm font-bold text-white">Add Photo</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Pick a source below</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button type="button" onClick={() => editCameraRef.current?.click()}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold"
                    style={{ backgroundColor: '#1a2e5a', color: '#f5c518', border: '1px solid rgba(245,197,24,0.25)' }}>
                    <span className="text-lg">📸</span><span>Camera</span>
                  </button>
                  <button type="button" onClick={() => editGalleryRef.current?.click()}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold"
                    style={{ backgroundColor: '#1a2e5a', color: '#f5c518', border: '1px solid rgba(245,197,24,0.25)' }}>
                    <span className="text-lg">🖼️</span><span>Gallery</span>
                  </button>
                  <button type="button" onClick={() => editFileRef.current?.click()}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold"
                    style={{ backgroundColor: '#1a2e5a', color: '#f5c518', border: '1px solid rgba(245,197,24,0.25)' }}>
                    <span className="text-lg">📁</span><span>Files</span>
                  </button>
                </div>

                {editImagePreview && (
                  <p className="text-xs mt-1.5" style={{ color: '#4ade80' }}>✓ New photo selected — save to apply</p>
                )}
              </div>

              {/* Supplier */}
              <div className="rounded-xl p-4" style={{ backgroundColor: '#1a2e5a' }}>
                <SupplierSection
                  supplierId={editSupplierId}
                  supplierSku={editSupplierSku}
                  onSupplierChange={setEditSupplierId}
                  onSkuChange={setEditSupplierSku}
                />
              </div>

              {/* Channels */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#f5c518' }}>
                  Sales Channels
                </h3>
                <div className="space-y-2">
                  {CHANNELS.map(ch => (
                    <div key={ch.key} className="flex items-center justify-between rounded-xl px-4 py-3"
                      style={{ backgroundColor: '#1a2e5a' }}>
                      <p className="text-sm font-bold text-white">{ch.emoji} {ch.label}</p>
                      <button
                        onClick={() => setEditChannels(prev => ({ ...prev, [ch.key]: !prev[ch.key] }))}
                        className="w-12 h-6 rounded-full transition-colors relative"
                        style={{ backgroundColor: editChannels[ch.key] ? '#f5c518' : '#374151' }}>
                        <div className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                          style={{ left: editChannels[ch.key] ? '26px' : '4px' }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pricing */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#f5c518' }}>
                  Prices (BSD $)
                </h3>
                <p className="text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Type cost OR any channel price — the rest auto-fill from BSC margins.
                </p>
                <div className="rounded-xl px-4 py-3 mb-3" style={{ backgroundColor: '#1a2e5a' }}>
                  <label className="text-xs font-bold mb-2 block" style={{ color: '#f5c518' }}>
                    Cost Per Unit
                  </label>
                  <input type="number" step="0.01" min="0"
                    placeholder="Cost per unit"
                    value={editCost}
                    onChange={e => {
                      const v = e.target.value;
                      setEditCost(v);
                      setEditPrices(prev => pricesFromCost(v, prev));
                    }}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
                    style={{ backgroundColor: '#060d1f', border: '1px solid rgba(245,197,24,0.3)' }} />
                </div>
                <div className="space-y-2">
                  {CHANNELS.map(ch => (
                    <div key={ch.key} className="flex items-center gap-3">
                      <label className="text-xs font-semibold w-28 shrink-0"
                        style={{ color: 'rgba(255,255,255,0.6)' }}>
                        {ch.emoji} {ch.label}
                      </label>
                      <input type="number" step="0.01" min="0" placeholder="0.00"
                        value={editPrices[ch.key]}
                        onChange={e => {
                          const v = e.target.value;
                          const { cost, prices } = recalcFromChannelPrice(ch.key, v, editPrices);
                          setEditPrices(prices);
                          if (cost) setEditCost(cost);
                        }}
                        className="flex-1 rounded-xl px-3 py-2 text-sm text-white outline-none"
                        style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* BSC 5-Channel Pricing Preview — live calculation from cost using
                  the new pricing_rules (22/19/35/40/40). Read-only here;
                  the editable per-channel prices above are the manual snapshot the
                  POS reads at sale time. Use this to spot-check that admin prices
                  are in sync with BSC margins. */}
              <BscPricingPreview cost={parseFloat(editCost) || 0} unit={selected.unit_type || 'each'} productId={selected.id} />

              <div className="flex gap-3 pt-2">
                <button onClick={() => setSelected(null)}
                  className="flex-1 py-3 rounded-xl text-sm font-bold"
                  style={{ backgroundColor: '#1f2937', color: '#9ca3af' }}>
                  Cancel
                </button>
                <button onClick={saveProduct} disabled={saving}
                  className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-50"
                  style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                  {saving ? 'Saving…' : '✓ Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── QUICK SALE WEIGHT INPUT ── */}
      {saleWeightInput && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-6">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-700">
            <h3 className="font-bold text-lg mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>Enter Weight (lbs)</h3>
            <p className="text-sm text-gray-400 mb-4">{products.find(p => p.id === saleWeightInput.productId)?.name}</p>
            <input
              type="number" step="0.01" min="0.01" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
              placeholder="e.g. 2.45" value={saleWeightInput.weight}
              onChange={e => setSaleWeightInput(prev => prev ? { ...prev, weight: e.target.value } : null)}
              onKeyDown={e => e.key === 'Enter' && confirmSaleWeight()}
              className="w-full bg-gray-800 text-white text-2xl rounded-xl px-4 py-3 border border-gray-600 focus:outline-none focus:border-yellow-400 text-center"
              autoFocus />
            <p className="text-xs text-gray-500 text-center mt-1">pounds — decimals supported (e.g. <strong>2.45</strong>)</p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setSaleWeightInput(null)} className="flex-1 bg-gray-800 text-gray-300 rounded-xl py-3 text-sm font-medium">Cancel</button>
              <button onClick={confirmSaleWeight} className="flex-1 rounded-xl py-3 text-sm font-bold" style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>Add to Cart</button>
            </div>
          </div>
        </div>
      )}

      {/* ── QUICK SALE DRAWER ── */}
      {saleOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setSaleOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md h-full flex flex-col overflow-hidden border-l"
            style={{ backgroundColor: '#060d1f', borderColor: 'rgba(245,197,24,0.25)' }}>
            <div className="px-5 py-4 border-b flex items-center justify-between"
              style={{ borderColor: 'rgba(245,197,24,0.2)' }}>
              <h2 className="font-bold text-lg" style={{ color: '#f5c518', fontFamily: "'Playfair Display', serif" }}>🛒 Quick Sale</h2>
              <button onClick={() => setSaleOpen(false)} className="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Channel */}
              <div>
                <label className="text-[10px] uppercase tracking-wide font-bold block mb-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>Sale channel</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { k: 'nassau_pos',    l: '🟡 Nassau POS' },
                    { k: 'andros_pos',    l: '🟣 Andros POS' },
                    { k: 'online_retail', l: '🛒 Online' },
                    { k: 'wholesale',     l: '📦 Wholesale' },
                  ].map(c => (
                    <button key={c.k} onClick={() => setSaleChannel(c.k as SaleChannel)}
                      className="px-2 py-2 rounded-lg text-xs font-bold"
                      style={saleChannel === c.k
                        ? { backgroundColor: '#f5c518', color: '#060d1f' }
                        : { backgroundColor: '#1a2e5a', color: '#94a3b8', border: '1px solid rgba(245,197,24,0.2)' }}>
                      {c.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cart lines */}
              {saleCart.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  No items yet. Tap 🛒 on a product to add it.
                </div>
              ) : (
                <div className="space-y-2">
                  {saleCart.map((line, i) => {
                    const { pricing, line_subtotal } = saleLineInfo(line);
                    const isLb = line.product.unit_type === 'lb';
                    return (
                      <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ backgroundColor: '#0f1f3d' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate text-white">{line.product.name}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                            ${pricing.unit_price.toFixed(2)}{isLb ? '/lb' : ''}
                            {isLb && line.weight_lb ? ` × ${line.weight_lb.toFixed(2)} lbs` : line.quantity > 1 ? ` × ${line.quantity}` : ''}
                            {pricing.upgraded_to_wholesale && (
                              <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: '#16a34a', color: '#fff' }}>WHOLESALE</span>
                            )}
                          </p>
                          {pricing.qualifies_as_wholesale && !pricing.wholesale_price_available && (
                            <p className="text-[10px] mt-0.5" style={{ color: '#fbbf24' }}>⚠ qualifies — no wholesale price set</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isLb && (
                            <>
                              <button onClick={() => adjustSaleQty(i, -1)} className="w-7 h-7 bg-gray-700 rounded-full text-sm font-bold">−</button>
                              <span className="text-sm w-4 text-center text-white">{line.quantity}</span>
                              <button onClick={() => adjustSaleQty(i, 1)} className="w-7 h-7 bg-gray-700 rounded-full text-sm font-bold">+</button>
                            </>
                          )}
                          <span className="text-sm font-bold ml-1" style={{ color: '#f5c518' }}>${line_subtotal.toFixed(2)}</span>
                          <button onClick={() => removeFromSale(i)} className="text-red-400 text-xl ml-1 leading-none">×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Customer */}
              <div className="rounded-xl p-3" style={{ backgroundColor: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)' }}>
                <label className="text-[10px] uppercase tracking-wide font-bold block mb-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>Customer phone</label>
                <input type="tel" inputMode="tel" autoComplete="tel" placeholder="e.g. 242-555-0100"
                  value={salePhone} onChange={(e) => handleSalePhoneChange(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 mb-2 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400" />
                {saleStatus === 'looking' && <p className="text-[11px] animate-pulse" style={{ color: 'rgba(255,255,255,0.55)' }}>Looking up…</p>}
                {saleStatus === 'found' && saleFoundCust && (
                  <div className="rounded-lg p-2 mb-2" style={{ backgroundColor: '#052e16' }}>
                    <p className="text-[11px] font-bold" style={{ color: '#4ade80' }}>✓ Returning customer</p>
                    <p className="text-sm font-semibold text-white">{saleFoundCust.full_name}</p>
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{saleFoundCust.total_orders} orders · ${Number(saleFoundCust.total_spent).toFixed(2)} lifetime</p>
                  </div>
                )}
                {saleStatus === 'new' && (
                  <p className="text-[11px] mb-1" style={{ color: '#fbbf24' }}>⚠ New customer — fill name + email below</p>
                )}
                <input type="text" placeholder="Full name" value={saleName} onChange={(e) => setSaleName(e.target.value)} readOnly={saleStatus === 'found'}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 mb-2 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400" />
                <input type="email" placeholder="Email (for receipts)" value={saleEmail} onChange={(e) => setSaleEmail(e.target.value)} readOnly={saleStatus === 'found' && !!saleFoundCust?.email}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 mb-2 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400" />
                {!saleFoundCust?.email_marketing_consent && (
                  <label className="flex items-center gap-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    <input type="checkbox" checked={saleConsent} onChange={(e) => setSaleConsent(e.target.checked)} />
                    Email marketing consent (Wed Special + drops)
                  </label>
                )}
              </div>

              {/* Payment */}
              <div className="rounded-xl p-3" style={{ backgroundColor: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)' }}>
                <label className="text-[10px] uppercase tracking-wide font-bold block mb-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>Payment</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[{k:'cash',l:'💵 Cash'},{k:'card',l:'💳 Card'},{k:'wire',l:'🏦 Wire'}].map(pm => (
                    <button key={pm.k} onClick={() => setSalePayment(pm.k as SalePayment)}
                      className="px-2 py-2 rounded-lg text-xs font-bold"
                      style={salePayment === pm.k
                        ? { backgroundColor: '#f5c518', color: '#060d1f' }
                        : { backgroundColor: '#1a2e5a', color: '#94a3b8' }}>
                      {pm.l}
                    </button>
                  ))}
                </div>
                {salePayment === 'cash' && (
                  <input type="number" inputMode="decimal" step="0.01" min="0" placeholder={`Tendered (need ${saleTotal.toFixed(2)})`}
                    value={saleCashTendered} onChange={(e) => setSaleCashTendered(e.target.value)}
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 mt-2 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400" />
                )}
              </div>
            </div>

            <div className="px-5 pb-5 pt-3 border-t" style={{ borderColor: 'rgba(245,197,24,0.2)' }}>
              <div className="flex justify-between text-sm mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                <span>Subtotal</span><span>${saleSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-xl mb-3 text-white">
                <span>Total</span><span style={{ color: '#f5c518' }}>${saleTotal.toFixed(2)}</span>
              </div>
              <button onClick={handleSaleCharge} disabled={saleCart.length === 0 || saleSubmitting}
                className="w-full py-3.5 rounded-xl font-bold text-sm disabled:opacity-40"
                style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                {saleSubmitting ? 'Saving…' : `Charge $${saleTotal.toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Read-only preview of what the BSC 5-channel pricing system would charge
// at the given cost. Auto-routes qty=15 lb / qty=1 case through the
// wholesale upgrades so admin can see the FULL spread of channel prices.
function BscPricingPreview({ cost, unit, productId }: { cost: number; unit: string; productId: string }) {
  if (!cost || cost <= 0) {
    return (
      <div className="rounded-xl p-4" style={{ backgroundColor: '#0a1628', border: '1px solid rgba(167,139,250,0.4)' }}>
        <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#a78bfa' }}>
          BSC 5-channel pricing preview
        </h3>
        <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Enter a Cost Per Unit above to see what the new BSC pricing structure (22/19/35/40/40) would charge across all five channels.
        </p>
      </div>
    );
  }

  // Two scenarios per row: under-threshold (retail rate) and at-threshold
  // (auto-upgrades retail channels to wholesale).
  const isWeight = unit === 'lb';
  const channels: { ch: PricingChannel; label: string; retailQty: number; upgradeQty: number }[] = [
    { ch: 'nassau_pos',    label: '🟡 Nassau POS',     retailQty: 1, upgradeQty: isWeight ? 10 : 1 },
    { ch: 'andros_pos',    label: '🟢 Andros POS',     retailQty: 1, upgradeQty: isWeight ? 10 : 1 },
    { ch: 'online_retail', label: '🛒 Online',          retailQty: 1, upgradeQty: isWeight ? 10 : 1 },
  ];
  const saleUnit = (isWeight ? 'lb' : 'each') as 'lb' | 'each';

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#0a1628', border: '1px solid rgba(167,139,250,0.4)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#a78bfa' }}>
          BSC 5-channel pricing preview
        </h3>
        <Link href={`/pos?focus=${encodeURIComponent(productId)}`} target="_blank" rel="noopener noreferrer"
          className="text-[11px] font-bold rounded-md px-2 py-1"
          style={{ backgroundColor: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid rgba(245,197,24,0.4)' }}>
          🛒 Sell at POS →
        </Link>
      </div>
      <p className="text-[10px] mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Live math from cost ${cost.toFixed(2)}/{isWeight ? 'lb' : 'unit'} via <code>calculatePrice()</code>. Wholesale fires at 10+ lbs or by-the-case.
      </p>
      <div className="space-y-1.5 text-[11px]">
        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 font-bold pb-1 mb-1 border-b" style={{ color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(167,139,250,0.2)' }}>
          <span>Channel</span><span className="text-right">Retail</span><span className="text-right">10+ {isWeight ? 'lbs' : 'cases'}</span>
        </div>
        {channels.map(({ ch, label, retailQty, upgradeQty }) => {
          const retail   = calculatePrice({ cost, channel: ch, quantity: retailQty, unit: saleUnit });
          const upgrade  = calculatePrice({ cost, channel: ch, quantity: upgradeQty, unit: isWeight ? 'lb' : 'case' });
          return (
            <div key={ch} className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 items-center">
              <span className="text-white">{label}</span>
              <span className="text-right" style={{ color: '#fbbf24' }}>
                ${retail.unitPrice.toFixed(2)} <span style={{ color: 'rgba(255,255,255,0.4)' }}>({retail.markupPct}%)</span>
              </span>
              <span className="text-right">
                <span style={{ color: '#4ade80' }}>${upgrade.unitPrice.toFixed(2)}</span>{' '}
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>({upgrade.markupPct}%{upgrade.upgradedToWholesale ? ' ⬇' : ''})</span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] mt-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
        Retail subtotal uses the requested channel; the right column auto-upgrades to{' '}
        <strong style={{ color: '#a78bfa' }}>wholesale_in_store ({BSC_PRICING_RULES.wholesale_in_store.markupPct}%)</strong>{' '}
        for POS lines or{' '}
        <strong style={{ color: '#a78bfa' }}>wholesale_online ({BSC_PRICING_RULES.wholesale_online.markupPct}%)</strong>{' '}
        for online lines.
      </p>
    </div>
  );
}
