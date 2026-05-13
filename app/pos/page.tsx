'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'

let _supabase: ReturnType<typeof createBrowserClient> | null = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _supabase
}

interface Product {
  id: string
  sku: string
  barcode: string | null
  name: string
  category: string
  is_bsc_processed: boolean
  sell_price: number
  promo_price: number | null
  promo_label: string | null
  is_per_lb: boolean
}

interface CartItem {
  product: Product
  quantity: number
  unit_price: number
  weight_lb?: number
}

interface Promotion {
  product_id: string
  promo_price: number
  display_label: string
}

interface Customer {
  id: string
  full_name: string
  phone: string
  total_orders: number
  total_spent: number
}

const TERMINALS = [
  { value: 'rbc_plug_and_play', label: '📱 RBC Plug & Play' },
  { value: 'rbc_physical_terminal', label: '🖥️ RBC Physical Terminal' },
]

const PAYMENT_METHODS = [
  { value: 'cash', label: '💵 Cash' },
  { value: 'card', label: '💳 Card' },
  { value: 'wire', label: '🏦 Wire Transfer' },
]

const CATEGORIES = [
  { label: 'All',     match: (c: string) => true },
  { label: 'Seafood', match: (c: string) => c.includes('seafood') },
  { label: 'Meat',    match: (c: string) => c === 'meat' },
  { label: 'Produce', match: (c: string) => c === 'produce' },
  { label: 'Grocery', match: (c: string) => c === 'grocery' },
]

const PER_LB_SKUS = new Set(['83359'])

export default function POSPage() {
  const supabase = getSupabase()
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [isWednesday, setIsWednesday] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCart, setShowCart] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [terminal, setTerminal] = useState('rbc_plug_and_play')
  const [cardRef, setCardRef] = useState('')
  const [cashTendered, setCashTendered] = useState('')
  const [wireRef, setWireRef] = useState('')
  const [orderSuccess, setOrderSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [weightInput, setWeightInput] = useState<{ productId: string; weight: string } | null>(null)

  // Customer state
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null)
  const [customerLookingUp, setCustomerLookingUp] = useState(false)
  const [customerStatus, setCustomerStatus] = useState<'idle' | 'found' | 'new'>('idle')
  const phoneSearchTimeout = useRef<NodeJS.Timeout | null>(null)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const today = new Date().getDay()
      setIsWednesday(today === 3)

      const { data: productsRaw, error: prodErr } = await supabase
        .from('products')
        .select('id, sku, barcode, name, category, is_bsc_processed, product_pricing!inner(manual_unit_price)')
        .eq('sell_nassau', true)
        .eq('status', 'active')
        .eq('product_pricing.channel', 'nassau_pos')
        .eq('product_pricing.is_current', true)
        .eq('product_pricing.is_active', true)
        .order('name')

      if (prodErr) throw prodErr

      let promos: Promotion[] = []
      if (today === 3) {
        const { data: promoRaw, error: promoErr } = await supabase
          .from('promotions')
          .select('product_id, promo_price, display_label')
          .eq('day_of_week', 3)
          .eq('channel', 'nassau_pos')
          .eq('is_active', true)
        if (!promoErr && promoRaw) promos = promoRaw
      }

      const promoMap = new Map(promos.map(pr => [pr.product_id, pr]))

      const merged: Product[] = (productsRaw ?? []).map((p: any) => {
        const pricing = Array.isArray(p.product_pricing) ? p.product_pricing[0] : p.product_pricing
        const promo = promoMap.get(p.id)
        return {
          id: p.id, sku: p.sku, barcode: p.barcode, name: p.name,
          category: p.category, is_bsc_processed: p.is_bsc_processed,
          sell_price: Number(pricing?.manual_unit_price ?? 0),
          promo_price: promo ? Number(promo.promo_price) : null,
          promo_label: promo?.display_label ?? null,
          is_per_lb: PER_LB_SKUS.has(p.sku),
        }
      })

      setProducts(merged)
    } catch (err: any) {
      setError(err.message ?? 'Failed to load catalog')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { loadCatalog() }, [loadCatalog])

  // Phone lookup — fires 600ms after user stops typing
  function handlePhoneChange(val: string) {
    setCustomerPhone(val)
    setFoundCustomer(null)
    setCustomerStatus('idle')
    setCustomerName('')
    if (phoneSearchTimeout.current) clearTimeout(phoneSearchTimeout.current)
    if (val.length < 7) return
    phoneSearchTimeout.current = setTimeout(async () => {
      setCustomerLookingUp(true)
      const { data } = await supabase
        .from('customers')
        .select('id, full_name, phone, total_orders, total_spent')
        .eq('phone', val.trim())
        .maybeSingle()
      setCustomerLookingUp(false)
      if (data) {
        setFoundCustomer(data)
        setCustomerName(data.full_name)
        setCustomerStatus('found')
      } else {
        setCustomerStatus('new')
      }
    }, 600)
  }

  function resetCheckout() {
    setCustomerPhone('')
    setCustomerName('')
    setFoundCustomer(null)
    setCustomerStatus('idle')
    setCardRef('')
    setCashTendered('')
    setWireRef('')
    setPaymentMethod('cash')
  }

  const activeCat = CATEGORIES.find(c => c.label === activeCategory) ?? CATEGORIES[0]
  const filtered = products.filter(p => {
    const matchCat = activeCat.match(p.category)
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search)
    return matchCat && matchSearch
  })

  function addToCart(product: Product, weightLb?: number) {
    if (product.is_per_lb && !weightLb) { setWeightInput({ productId: product.id, weight: '' }); return }
    const unit_price = product.promo_price ?? product.sell_price
    setCart(prev => {
      if (!product.is_per_lb) {
        const idx = prev.findIndex(i => i.product.id === product.id)
        if (idx > -1) return prev.map((item, i) => i === idx ? { ...item, quantity: item.quantity + 1 } : item)
      }
      return [...prev, { product, quantity: 1, unit_price, weight_lb: weightLb }]
    })
    setWeightInput(null)
  }

  function removeFromCart(idx: number) { setCart(prev => prev.filter((_, i) => i !== idx)) }

  function adjustQty(idx: number, delta: number) {
    setCart(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const qty = item.quantity + delta
      return qty <= 0 ? null : { ...item, quantity: qty }
    }).filter(Boolean) as CartItem[])
  }

  function confirmWeight() {
    if (!weightInput) return
    const product = products.find(p => p.id === weightInput.productId)
    const lbs = parseFloat(weightInput.weight)
    if (!product || isNaN(lbs) || lbs <= 0) return
    addToCart(product, lbs)
  }

  const subtotal = cart.reduce((sum, item) => {
    if (item.product.is_per_lb && item.weight_lb) return sum + item.unit_price * item.weight_lb
    return sum + item.unit_price * item.quantity
  }, 0)
  const vatAmount = 0
  const total = subtotal + vatAmount
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const cashTenderedNum = parseFloat(cashTendered) || 0
  const changeDue = paymentMethod === 'cash' && cashTenderedNum >= total ? cashTenderedNum - total : 0
  const checkoutReady = paymentMethod === 'cash' ? (cashTenderedNum >= total && total > 0) : true

  async function handleCheckout() {
    if (!cart.length) return
    setSubmitting(true)
    try {
      // Upsert customer
      let customerId: string | null = null
      const phoneClean = customerPhone.trim()
      const nameClean = customerName.trim()

      if (phoneClean && nameClean) {
        if (foundCustomer) {
          // Existing customer — update stats
          await supabase.from('customers').update({
            last_seen_at: new Date().toISOString(),
            total_orders: foundCustomer.total_orders + 1,
            total_spent: Number(foundCustomer.total_spent) + total,
          }).eq('id', foundCustomer.id)
          customerId = foundCustomer.id
        } else {
          // New customer — insert
          const { data: newCust } = await supabase.from('customers').insert({
            full_name: nameClean,
            phone: phoneClean,
            total_orders: 1,
            total_spent: total,
            created_by: '7b62672c-9259-4c1b-98d4-3b78369a52ab',
          }).select('id').single()
          customerId = newCust?.id ?? null
        }
      }

      // Build admin notes
      let adminNotes = ''
      if (paymentMethod === 'card') {
        const terminalLabel = TERMINALS.find(t => t.value === terminal)?.label ?? terminal
        adminNotes = cardRef ? `Card ref: ${cardRef} | Terminal: ${terminalLabel}` : `Terminal: ${terminalLabel}`
      } else if (paymentMethod === 'cash') {
        adminNotes = `Cash tendered: $${cashTenderedNum.toFixed(2)} | Change: $${changeDue.toFixed(2)}`
      } else if (paymentMethod === 'wire') {
        adminNotes = wireRef ? `Wire ref: ${wireRef}` : 'Wire transfer'
      }

      const items = cart.map(item => ({
        product_id: item.product.id, sku: item.product.sku, name: item.product.name,
        quantity: item.quantity, unit_price: item.unit_price, weight_lb: item.weight_lb ?? null,
        line_total: item.product.is_per_lb && item.weight_lb ? item.unit_price * item.weight_lb : item.unit_price * item.quantity,
        promo_applied: item.product.promo_price !== null, promo_label: item.product.promo_label ?? null,
      }))

      const { error: orderErr } = await supabase.from('orders').insert({
        location: 'bsc_marketplace_nassau', channel: 'nassau_pos', items,
        subtotal, vat_amount: vatAmount, total,
        payment_method: paymentMethod,
        terminal_type: paymentMethod === 'card' ? terminal : null,
        admin_notes: adminNotes, status: 'completed',
        customer_id: customerId,
        customer_name: nameClean || null,
        customer_phone: phoneClean || null,
      })
      if (orderErr) throw orderErr

      setOrderSuccess(true)
      setCart([])
      resetCheckout()
      setShowCheckout(false)
      setShowCart(false)
      setTimeout(() => setOrderSuccess(false), 4000)
    } catch (err: any) {
      alert('Order failed: ' + (err.message ?? 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      <header className="sticky top-0 z-40 bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg leading-tight" style={{ color: '#f5c518', fontFamily: "'Playfair Display', serif" }}>BSC Marketplace</h1>
            <p className="text-xs text-gray-400">Nassau POS · Fire Trail Road</p>
          </div>
          <div className="flex items-center gap-3">
            {isWednesday && <span className="text-xs font-bold px-2 py-1 rounded-full animate-pulse" style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>🐟 Wed Special</span>}
            <button onClick={() => setShowCart(true)} className="relative bg-gray-800 rounded-xl px-4 py-2 text-sm font-semibold" style={{ color: '#f5c518' }}>
              🛒 Cart
              {cartCount > 0 && <span className="absolute -top-1 -right-1 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold" style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>{cartCount}</span>}
            </button>
          </div>
        </div>
        <div className="mt-3">
          <input type="text" placeholder="Search product or scan SKU..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-gray-800 text-white rounded-xl px-4 py-2 text-sm border border-gray-700 focus:outline-none focus:border-yellow-400" />
        </div>
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {CATEGORIES.map(cat => (
            <button key={cat.label} onClick={() => setActiveCategory(cat.label)} className="shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
              style={activeCategory === cat.label ? { backgroundColor: '#f5c518', color: '#060d1f', fontWeight: 700 } : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
              {cat.label}
            </button>
          ))}
        </div>
      </header>

      {isWednesday && (
        <div className="mx-4 mt-4 rounded-xl p-3 text-center" style={{ backgroundColor: '#1a1500', border: '1px solid #f5c518' }}>
          <p className="text-sm font-bold" style={{ color: '#f5c518' }}>🐟 Wednesday Salmon Special — Prices applied automatically</p>
          <p className="text-xs text-gray-400 mt-1">4oz $2.75 · 6oz $5.50 · 8oz $7.20 · 2-3lb Fillet $26.00/piece</p>
        </div>
      )}

      {orderSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl px-6 py-3 text-sm font-bold shadow-xl" style={{ backgroundColor: '#16a34a', color: 'white' }}>✓ Sale saved successfully</div>
      )}

      <main className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48"><p className="text-gray-400 text-sm animate-pulse">Loading catalog...</p></div>
        ) : error ? (
          <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 text-sm text-red-300">
            <p className="font-bold">Failed to load catalog</p>
            <p className="mt-1 text-xs">{error}</p>
            <button onClick={loadCatalog} className="mt-3 text-xs underline">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-16 text-sm">No products found</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map(product => {
              const displayPrice = product.promo_price ?? product.sell_price
              const hasPromo = product.promo_price !== null
              return (
                <button key={product.id} onClick={() => addToCart(product)} className="relative bg-gray-900 border rounded-xl p-3 text-left active:scale-95 transition-transform" style={{ borderColor: hasPromo ? '#f5c518' : '#374151' }}>
                  {hasPromo && <span className="absolute top-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>Special</span>}
                  {product.is_bsc_processed && <span className="absolute top-2 left-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-900 text-blue-300">BSC</span>}
                  <p className="text-xs text-gray-500 mt-5 mb-1">{product.sku}</p>
                  <p className="text-sm font-semibold text-white leading-tight line-clamp-2">{product.name}</p>
                  <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-base font-bold" style={{ color: '#f5c518' }}>${displayPrice.toFixed(2)}</span>
                    {hasPromo && <span className="text-xs text-gray-500 line-through">${product.sell_price.toFixed(2)}</span>}
                    {product.is_per_lb && <span className="text-xs text-gray-400">/lb</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {weightInput && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-700">
            <h3 className="font-bold text-lg mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>Enter Weight (lbs)</h3>
            <p className="text-sm text-gray-400 mb-4">{products.find(p => p.id === weightInput.productId)?.name}</p>
            <input type="number" step="0.01" min="0.01" placeholder="e.g. 2.5" value={weightInput.weight}
              onChange={e => setWeightInput(prev => prev ? { ...prev, weight: e.target.value } : null)}
              onKeyDown={e => e.key === 'Enter' && confirmWeight()}
              className="w-full bg-gray-800 text-white text-2xl rounded-xl px-4 py-3 border border-gray-600 focus:outline-none focus:border-yellow-400 text-center" autoFocus />
            <p className="text-xs text-gray-500 text-center mt-1">pounds</p>
            {weightInput.weight && !isNaN(parseFloat(weightInput.weight)) && (
              <p className="text-center text-sm mt-3" style={{ color: '#f5c518' }}>
                Total: <strong>${((products.find(p => p.id === weightInput.productId)?.promo_price ?? products.find(p => p.id === weightInput.productId)?.sell_price ?? 0) * parseFloat(weightInput.weight)).toFixed(2)}</strong>
              </p>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setWeightInput(null)} className="flex-1 bg-gray-800 text-gray-300 rounded-xl py-3 text-sm font-medium">Cancel</button>
              <button onClick={confirmWeight} className="flex-1 rounded-xl py-3 text-sm font-bold" style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>Add to Cart</button>
            </div>
          </div>
        </div>
      )}

      {showCart && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCart(false)} />
          <div className="relative bg-gray-900 rounded-t-3xl border-t border-gray-700 flex flex-col" style={{ maxHeight: '95dvh', WebkitOverflowScrolling: 'touch' as any }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800 shrink-0">
              <h2 className="font-bold text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>Cart ({cartCount})</h2>
              <button onClick={() => setShowCart(false)} className="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {cart.length === 0 ? (
                <p className="text-center text-gray-500 py-12 text-sm">Cart is empty</p>
              ) : (
                <div className="space-y-3">
                  {cart.map((item, i) => {
                    const lineTotal = item.product.is_per_lb && item.weight_lb ? item.unit_price * item.weight_lb : item.unit_price * item.quantity
                    return (
                      <div key={i} className="flex items-center gap-3 bg-gray-800 rounded-xl p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{item.product.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            ${item.unit_price.toFixed(2)}{item.product.is_per_lb && item.weight_lb ? ` × ${item.weight_lb}lb` : item.quantity > 1 ? ` × ${item.quantity}` : ''}
                            {item.product.promo_price !== null && <span className="ml-1.5" style={{ color: '#f5c518' }}>★ Special</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!item.product.is_per_lb && (
                            <>
                              <button onClick={() => adjustQty(i, -1)} className="w-7 h-7 bg-gray-700 rounded-full text-sm font-bold flex items-center justify-center">−</button>
                              <span className="text-sm w-4 text-center">{item.quantity}</span>
                              <button onClick={() => adjustQty(i, 1)} className="w-7 h-7 bg-gray-700 rounded-full text-sm font-bold flex items-center justify-center">+</button>
                            </>
                          )}
                          <span className="text-sm font-bold ml-1" style={{ color: '#f5c518' }}>${lineTotal.toFixed(2)}</span>
                          <button onClick={() => removeFromCart(i)} className="text-red-400 text-xl ml-1 leading-none">×</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="px-5 pb-6 pt-3 border-t border-gray-800 shrink-0">
              <div className="flex justify-between text-sm text-gray-400 mb-1"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm text-gray-400 mb-3"><span>VAT (0% — food items)</span><span>$0.00</span></div>
              <div className="flex justify-between font-bold text-xl mb-4"><span>Total</span><span style={{ color: '#f5c518' }}>${total.toFixed(2)}</span></div>
              <button onClick={() => setShowCheckout(true)} disabled={cart.length === 0} className="w-full py-4 rounded-2xl font-bold text-base disabled:opacity-40" style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                Charge ${total.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCheckout && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-700 overflow-y-auto" style={{ maxHeight: '95dvh' }}>
            <h3 className="font-bold text-xl mb-5" style={{ fontFamily: "'Playfair Display', serif" }}>Checkout</h3>

            {/* ── Customer lookup ── */}
            <div className="mb-5 rounded-xl p-4" style={{ backgroundColor: '#0d1117', border: '1px solid #374151' }}>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Customer Phone</label>
              <input
                type="tel"
                placeholder="e.g. 242-555-0100"
                value={customerPhone}
                onChange={e => handlePhoneChange(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 mb-2 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400"
              />

              {customerLookingUp && <p className="text-xs text-gray-400 animate-pulse">Looking up customer...</p>}

              {customerStatus === 'found' && foundCustomer && (
                <div className="rounded-lg p-2 mb-2" style={{ backgroundColor: '#052e16' }}>
                  <p className="text-xs font-bold" style={{ color: '#4ade80' }}>✓ Returning Customer</p>
                  <p className="text-sm font-semibold text-white mt-0.5">{foundCustomer.full_name}</p>
                  <p className="text-xs text-gray-400">{foundCustomer.total_orders} orders · ${Number(foundCustomer.total_spent).toFixed(2)} lifetime</p>
                </div>
              )}

              {customerStatus === 'new' && (
                <>
                  <div className="rounded-lg p-2 mb-2" style={{ backgroundColor: '#1c1200' }}>
                    <p className="text-xs font-bold" style={{ color: '#f5c518' }}>✦ New Customer</p>
                    <p className="text-xs text-gray-400">Enter name to save to database</p>
                  </div>
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Customer Name</label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400"
                  />
                </>
              )}

              {customerStatus === 'idle' && !customerLookingUp && (
                <p className="text-xs text-gray-500">Optional — enter phone to look up or create customer</p>
              )}
            </div>

            {/* ── Payment method ── */}
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wide">Payment Method</label>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {PAYMENT_METHODS.map(pm => (
                <button key={pm.value} onClick={() => setPaymentMethod(pm.value)}
                  className="py-3 rounded-xl text-xs font-bold transition-colors"
                  style={paymentMethod === pm.value ? { backgroundColor: '#f5c518', color: '#060d1f' } : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
                  {pm.label}
                </button>
              ))}
            </div>

            {/* Card */}
            {paymentMethod === 'card' && (
              <>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Terminal</label>
                <select value={terminal} onChange={e => setTerminal(e.target.value)} className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 mb-4 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400">
                  {TERMINALS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Card Ref # (optional)</label>
                <input type="text" placeholder="e.g. 4521" value={cardRef} onChange={e => setCardRef(e.target.value)} className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 mb-4 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400" />
              </>
            )}

            {/* Cash */}
            {paymentMethod === 'cash' && (
              <>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Cash Tendered ($)</label>
                <input type="number" step="0.01" min="0" placeholder={total.toFixed(2)} value={cashTendered} onChange={e => setCashTendered(e.target.value)} className="w-full bg-gray-800 text-white text-xl rounded-xl px-4 py-3 mb-3 border border-gray-700 text-center focus:outline-none focus:border-yellow-400" autoFocus />
                {cashTenderedNum >= total && total > 0 && (
                  <div className="rounded-xl p-3 mb-4 text-center" style={{ backgroundColor: '#052e16' }}>
                    <p className="text-xs text-gray-400">Change Due</p>
                    <p className="text-2xl font-bold" style={{ color: '#4ade80' }}>${changeDue.toFixed(2)}</p>
                  </div>
                )}
                {cashTenderedNum > 0 && cashTenderedNum < total && (
                  <p className="text-xs text-red-400 text-center mb-4">Amount is less than total</p>
                )}
              </>
            )}

            {/* Wire */}
            {paymentMethod === 'wire' && (
              <>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Wire Ref # (optional)</label>
                <input type="text" placeholder="e.g. TRF-20260513" value={wireRef} onChange={e => setWireRef(e.target.value)} className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 mb-4 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400" />
              </>
            )}

            <div className="flex justify-between font-bold text-xl mb-5"><span>Total</span><span style={{ color: '#f5c518' }}>${total.toFixed(2)}</span></div>
            <div className="flex gap-3">
              <button onClick={() => { setShowCheckout(false); resetCheckout() }} disabled={submitting} className="flex-1 bg-gray-800 text-gray-300 rounded-xl py-3 text-sm font-medium">Back</button>
              <button onClick={handleCheckout} disabled={submitting || !checkoutReady} className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-50" style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                {submitting ? 'Saving...' : 'Confirm Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
