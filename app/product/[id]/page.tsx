'use client';

// /product/[id] — customer product detail page.
//
// Fetches the product, its online_market retail price, the local_wholesale
// snapshot (drives the per-line wholesale auto-upgrade at checkout), and any
// active special_price. Add-to-cart goes through lib/cart.ts so checkout
// sees the full pricing shape and doesn't silently overcharge wholesale-
// eligible customers retail.
//
// Lb-priced items honour decimal weight (per memory feedback_lb_decimal_
// stickiness) — the stepper switches to 0.25-lb increments and the input
// accepts free-form decimals.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { addToCart as addToCartHelper, type CartUnitType } from '@/lib/cart';

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  image_url: string;
  sell_online: boolean;
  status: string;
  unit_of_measure?: string | null;
  pack_size?: string | null;
}

interface PriceSnapshot {
  retail: number;
  wholesale: number | null;
  special: number | null;
}

interface Variant {
  id: string;
  sku: string;
  name: string;
  image_url?: string | null;
  unit_of_measure?: string | null;
  pack_size?: string | null;
  price: number;             // retail (display)
  wholesale: number | null;
  special: number | null;
}

const TRUST_BADGES: Record<string, { icon: string; label: string; sub: string }[]> = {
  fresh_seafood: [
    { icon: '❄️', label: 'KEEP FROZEN',      sub: 'Flash frozen for freshness' },
    { icon: '🏆', label: 'PREMIUM QUALITY',  sub: 'Carefully selected' },
    { icon: '🎣', label: 'WILD CAUGHT',      sub: 'Sustainably sourced' },
    { icon: '✅', label: 'SAFE & INSPECTED', sub: 'Inspected for your peace of mind' },
  ],
  frozen_seafood: [
    { icon: '❄️', label: 'KEEP FROZEN',      sub: 'Flash frozen for freshness' },
    { icon: '🏆', label: 'PREMIUM QUALITY',  sub: 'Carefully selected' },
    { icon: '🎣', label: 'WILD CAUGHT',      sub: 'Sustainably sourced' },
    { icon: '✅', label: 'SAFE & INSPECTED', sub: 'Inspected for your peace of mind' },
  ],
  processed_seafood: [
    { icon: '❄️', label: 'KEEP FROZEN',      sub: 'Flash frozen for freshness' },
    { icon: '🏆', label: 'PREMIUM QUALITY',  sub: 'Carefully selected' },
    { icon: '🐚', label: 'BAHAMIAN CAUGHT',  sub: 'Fresh from local waters' },
    { icon: '✅', label: 'SAFE & INSPECTED', sub: 'Processed at Spiny Tail Nassau' },
  ],
  meat: [
    { icon: '❄️', label: 'KEEP FROZEN',      sub: 'Flash frozen for freshness' },
    { icon: '🏆', label: 'PREMIUM QUALITY',  sub: 'Hand selected for quality' },
    { icon: '🐄', label: 'USDA CHOICE BEEF', sub: 'Marbled for flavor' },
    { icon: '✅', label: 'NO ADDED HORMONES',sub: 'No artificial ingredients' },
  ],
  default: [
    { icon: '❄️', label: 'KEEP FROZEN',      sub: 'Flash frozen for freshness' },
    { icon: '🏆', label: 'PREMIUM QUALITY',  sub: 'Carefully selected' },
    { icon: '🇧🇸', label: 'BAHAMIAN-OWNED',   sub: 'Family-run from Nassau' },
    { icon: '✅', label: 'SAFE & INSPECTED', sub: 'Quality guaranteed' },
  ],
};

const CATEGORY_LABEL: Record<string, string> = {
  fresh_seafood: 'SEAFOOD',
  frozen_seafood: 'SEAFOOD',
  processed_seafood: 'SEAFOOD',
  meat: 'BEEF',
  poultry: 'POULTRY',
  produce: 'PRODUCE',
  beverage: 'BEVERAGE',
  grocery: 'GROCERY',
  other: 'OTHER',
};

function toUnitType(uom: string | null | undefined): CartUnitType {
  if (uom === 'lb') return 'lb';
  if (uom === 'case') return 'case';
  return 'each';
}

export default function ProductPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedId, setSelectedId] = useState<string>(id);
  const [qty, setQty] = useState<number>(1);
  const [qtyInput, setQtyInput] = useState<string>('1');
  const [loading, setLoading] = useState(true);
  const [addedToCart, setAddedToCart] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: p } = await supabase
        .from('products')
        .select('id, sku, name, description, category, image_url, sell_online, status, unit_of_measure, pack_size')
        .eq('id', id)
        .single();
      if (!p) { setLoading(false); return; }
      setProduct(p as Product);

      // Find related size variants — same name prefix, different SKUs. This is
      // a heuristic — works well for "Snapper 4oz / 8oz / 1lb" SKU families.
      const baseName = (p as Product).name.replace(/\s+\d+\s*(oz|lb|lbs|g|kg).*$/i, '').trim();
      const relatedIds: string[] = [(p as Product).id];
      let related: Product[] = [];
      if (baseName.length > 3) {
        const { data: rel } = await supabase
          .from('products')
          .select('id, sku, name, category, image_url, unit_of_measure, pack_size, sell_online, status')
          .ilike('name', `${baseName}%`)
          .eq('sell_online', true)
          .eq('status', 'active')
          .neq('id', id)
          .limit(5);
        related = (rel as Product[]) || [];
        related.forEach((r) => relatedIds.push(r.id));
      }

      // One round-trip for every channel + active special across the whole
      // variant set. Drives wholesale auto-upgrade at checkout.
      const [{ data: pricingRows }, { data: specialRows }] = await Promise.all([
        supabase
          .from('product_pricing')
          .select('product_id, channel, manual_unit_price')
          .in('product_id', relatedIds)
          .in('channel', ['online_market', 'local_wholesale'])
          .eq('is_current', true),
        supabase
          .from('products')
          .select('id, special_price, special_starts_at, special_ends_at')
          .in('id', relatedIds),
      ]);

      const priceMap = new Map<string, PriceSnapshot>();
      ((pricingRows as { product_id: string; channel: string; manual_unit_price: number }[]) || []).forEach((row) => {
        const cur = priceMap.get(row.product_id) || { retail: 0, wholesale: null, special: null };
        if (row.channel === 'online_market')   cur.retail    = Number(row.manual_unit_price);
        if (row.channel === 'local_wholesale') cur.wholesale = Number(row.manual_unit_price);
        priceMap.set(row.product_id, cur);
      });
      const now = Date.now();
      ((specialRows as { id: string; special_price: number | null; special_starts_at: string | null; special_ends_at: string | null }[]) || []).forEach((row) => {
        const sp = row.special_price != null ? Number(row.special_price) : null;
        const startsOk = !row.special_starts_at || Date.parse(row.special_starts_at) <= now;
        const endsOk   = !row.special_ends_at   || Date.parse(row.special_ends_at)   >= now;
        if (sp != null && sp > 0 && startsOk && endsOk) {
          const cur = priceMap.get(row.id) || { retail: 0, wholesale: null, special: null };
          cur.special = sp;
          priceMap.set(row.id, cur);
        }
      });

      const buildVariant = (q: Product): Variant => {
        const snap = priceMap.get(q.id) || { retail: 0, wholesale: null, special: null };
        return {
          id: q.id,
          sku: q.sku,
          name: q.name,
          image_url: q.image_url,
          unit_of_measure: q.unit_of_measure,
          pack_size: q.pack_size,
          price: snap.retail,
          wholesale: snap.wholesale,
          special: snap.special,
        };
      };
      setVariants([buildVariant(p as Product), ...related.map(buildVariant)]);
      setLoading(false);
    })();
  }, [id]);

  // When user picks a different variant, reset selectedId; preserve the qty.
  useEffect(() => { setSelectedId(id); }, [id]);

  const selected = useMemo(
    () => variants.find((v) => v.id === selectedId) ?? variants[0],
    [variants, selectedId],
  );
  const unitType: CartUnitType = toUnitType(selected?.unit_of_measure);
  const isLb = unitType === 'lb';
  const step = isLb ? 0.25 : 1;
  const minQty = isLb ? 0.25 : 1;

  function bumpQty(delta: number) {
    const next = Math.max(minQty, +(qty + delta).toFixed(2));
    setQty(next);
    setQtyInput(String(next));
  }
  function onQtyInputChange(raw: string) {
    setQtyInput(raw);
    // Allow free-form typing — only commit a numeric value if parseable.
    if (raw === '' || raw === '.') return;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) setQty(n);
  }
  function onQtyBlur() {
    // On blur, snap below-min back up to the floor.
    if (!Number.isFinite(qty) || qty < minQty) {
      setQty(minQty);
      setQtyInput(String(minQty));
    }
  }

  function handleAddToCart() {
    if (!product || !selected) return;
    if (!Number.isFinite(qty) || qty <= 0) return;
    addToCartHelper({
      id: selected.id,
      source: 'market',
      sku: selected.sku,
      name: selected.name,
      image_url: selected.image_url ?? product.image_url,
      price: selected.price,
      wholesale_price: selected.wholesale,
      special_price: selected.special,
      unit_type: unitType,
      qty,
      unit: unitType,
      category: product.category ?? null,
      description: product.description ?? null,
    });
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2500);
  }

  const badges = product ? (TRUST_BADGES[product.category] ?? TRUST_BADGES.default) : TRUST_BADGES.default;
  const categoryLabel = product ? (CATEGORY_LABEL[product.category] ?? 'PRODUCT') : '';
  // Effective price the customer sees on the headline pill — special wins
  // over retail. (Wholesale auto-upgrade happens at checkout based on qty.)
  const displayPrice = selected?.special != null ? selected.special : selected?.price ?? 0;
  const showSpecial = selected?.special != null && selected?.price > selected.special;

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">🐟</div>
          <p className="text-slate-500 text-sm">Loading product…</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">😕</div>
          <p className="text-slate-700 font-bold">Product not found</p>
          <button onClick={() => router.push('/market')} className="mt-4 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-gold">
            Back to Market
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans pb-24">
      <div className="border-b border-slate-100 px-4 py-3">
        <button onClick={() => router.push('/market')} className="flex items-center gap-1.5 text-sm font-semibold text-navy hover:underline">
          ← Back to Market
        </button>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

          {/* Image */}
          <div>
            <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
              {(selected?.image_url || product.image_url) ? (
                <img src={selected?.image_url || product.image_url} alt={product.name} className="w-full object-cover aspect-square" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-slate-100 text-8xl">🐟</div>
              )}
            </div>
            {/* Multi-image thumbnail strip — only shows when variants have distinct images */}
            {variants.length > 1 && variants.some((v) => v.image_url && v.image_url !== variants[0].image_url) && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
                {variants.filter((v) => v.image_url).map((v) => (
                  <button key={v.id} onClick={() => setSelectedId(v.id)} className={`shrink-0 h-16 w-16 overflow-hidden rounded-lg border-2 ${selectedId === v.id ? 'border-navy' : 'border-slate-200'}`}>
                    <img src={v.image_url!} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-sm font-bold tracking-widest text-blue-600 mb-1">{categoryLabel}</p>
              <h1 className="text-3xl font-extrabold text-slate-900 leading-tight">{product.name}</h1>
            </div>

            {product.description && (
              <p className="text-slate-600 text-sm leading-relaxed border-t border-slate-100 pt-4">
                {product.description}
              </p>
            )}

            {/* Variants */}
            {variants.length > 1 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">SIZE</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {variants.map((v) => {
                    const active = selectedId === v.id;
                    const sizeMatch = v.name.match(/(\d+\s*(?:oz|lb|lbs|g|kg))/i);
                    const isVLb = v.unit_of_measure === 'lb';
                    const sizeLabel = sizeMatch ? sizeMatch[1]
                      : v.pack_size ? v.pack_size
                      : isVLb ? 'Per pound'
                      : v.unit_of_measure === 'case' ? 'Per case'
                      : 'Each';
                    const unitSuffix = isVLb ? '/ lb' : v.unit_of_measure === 'case' ? '/ case' : 'each';
                    const vPrice = v.special != null ? v.special : v.price;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelectedId(v.id)}
                        className={`rounded-xl border-2 p-3 text-left transition ${
                          active ? 'border-navy bg-white shadow-md' : 'border-slate-200 bg-white hover:border-slate-400'
                        }`}
                      >
                        <div className={`text-base font-extrabold ${active ? 'text-navy' : 'text-slate-700'}`}>
                          {sizeLabel}
                        </div>
                        {isVLb && (
                          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-700">⚖ per pound</div>
                        )}
                        <div className={`text-sm font-bold ${active ? 'text-navy' : 'text-slate-600'}`}>
                          BSD ${vPrice.toFixed(2)} <span className={isVLb ? 'text-amber-700' : 'text-slate-400'}>{unitSuffix}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Price */}
            {displayPrice > 0 && (
              <div>
                <p className="text-3xl font-extrabold text-navy">
                  BSD ${displayPrice.toFixed(2)}
                  {isLb && <span className="ml-1 text-lg font-extrabold text-amber-700">/ lb</span>}
                  {unitType === 'case' && <span className="ml-1 text-lg font-semibold text-slate-400">/ case</span>}
                  {showSpecial && (
                    <span className="ml-2 align-middle text-base text-slate-400 line-through">${selected!.price.toFixed(2)}</span>
                  )}
                </p>
                {isLb && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-800">
                    ⚖ Priced per pound — final price by weight
                  </p>
                )}
                {selected?.wholesale != null && (
                  <p className="mt-2 text-xs text-emerald-700">
                    Buying 10+ {isLb ? 'lb' : 'units'}? Wholesale price kicks in automatically at checkout (${selected.wholesale.toFixed(2)} {unitType === 'case' ? '/ case' : isLb ? '/ lb' : 'each'}).
                  </p>
                )}
              </div>
            )}

            {/* Quantity — decimal-aware for lb */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                QUANTITY {isLb && <span className="text-amber-700">(lb — decimals OK)</span>}
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2">
                  <button onClick={() => bumpQty(-step)} className="w-7 h-7 flex items-center justify-center text-navy font-bold text-lg rounded hover:bg-slate-100" aria-label="Decrease quantity">−</button>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={qtyInput}
                    onChange={(e) => onQtyInputChange(e.target.value)}
                    onBlur={onQtyBlur}
                    className="w-16 text-center font-bold text-navy outline-none"
                    aria-label="Quantity"
                  />
                  <button onClick={() => bumpQty(step)} className="w-7 h-7 flex items-center justify-center text-navy font-bold text-lg rounded hover:bg-slate-100" aria-label="Increase quantity">+</button>
                </div>
                <span className="text-sm font-semibold text-emerald-600">{isLb ? `${(qty * displayPrice).toFixed(2)} BSD est.` : ''}</span>
              </div>
            </div>

            {/* Add to cart */}
            <button
              onClick={handleAddToCart}
              className="flex w-full items-center justify-center gap-3 rounded-xl py-4 text-base font-extrabold transition"
              style={addedToCart
                ? { backgroundColor: '#16a34a', color: 'white' }
                : { backgroundColor: '#0f172a', color: 'white' }}
            >
              {addedToCart ? '✓ Added to Cart' : 'ADD TO CART 🛒'}
            </button>

            {/* Post-add CTA — give the customer somewhere to go */}
            {addedToCart && (
              <div className="flex gap-2">
                <Link href="/checkout" className="flex-1 rounded-xl bg-gold px-4 py-3 text-center text-sm font-extrabold text-navy hover:bg-gold-300">
                  View Cart & Checkout →
                </Link>
                <Link href="/market" className="flex-1 rounded-xl border-2 border-navy px-4 py-3 text-center text-sm font-extrabold text-navy hover:bg-navy hover:text-white">
                  Keep Shopping
                </Link>
              </div>
            )}

            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <span className="text-xl">🚚</span>
              <div>
                <div className="text-xs font-bold text-blue-600 uppercase tracking-wide">FAST & RELIABLE DELIVERY</div>
                <div className="text-xs text-slate-500">Refrigerated packaging · On-time guarantee · Nassau & Andros</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 border-t border-slate-100 pt-8 sm:grid-cols-4">
          {badges.map((b) => (
            <div key={b.label} className="flex flex-col items-center gap-2 text-center">
              <div className="text-3xl">{b.icon}</div>
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">{b.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{b.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky "View Cart" bar — always visible so the customer never gets stranded */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Link href="/market" className="text-sm font-bold text-navy hover:underline">← Market</Link>
          <Link href="/checkout" className="rounded-lg bg-navy px-4 py-2 text-sm font-extrabold text-gold hover:bg-navy-700">
            View Cart →
          </Link>
        </div>
      </div>
    </div>
  );
}
