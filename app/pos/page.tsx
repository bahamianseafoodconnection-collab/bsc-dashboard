'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { plainError } from '@/lib/plain-error'
import {
  fetchOverheadMetrics,
  computeProfitSplit,
  NASSAU_POS_MARGIN,
  type OverheadMetrics,
} from '@/lib/profit'
import { priceCartLine, lineCount, type ProductPriceSnapshot, type CartLinePricing } from '@/lib/cart-pricing'
import { toE164 } from '@/lib/phone'
import AddInventoryButton from '@/components/intake/AddInventoryButton'
import EditPriceModal from '@/components/pos/EditPriceModal'
import CustomerNameLookup, { type CustomerMatch } from '@/components/pos/CustomerNameLookup'

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
  sell_price: number              // nassau_pos retail snapshot
  wholesale_price: number | null  // local_wholesale snapshot (drives auto-upgrade at 10+ lbs / by case)
  promo_price: number | null
  promo_label: string | null
  is_per_lb: boolean
  unit: string                    // 'lb' | 'each' | 'case' — always shown on the card
}

interface CartItem {
  product: Product
  quantity: number
  weight_lb?: number
  // unit_price/applied channel are computed per-render via lineInfo()
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
  email?: string | null
  email_marketing_consent?: boolean | null
  total_orders: number
  total_spent: number
}

const TERMINALS = [
  { value: 'rbc_plug_and_play',      label: '📱 RBC Plug & Play' },
  { value: 'rbc_physical_terminal',  label: '🖥️ RBC Physical Terminal' },
]

const PAYMENT_METHODS = [
  { value: 'cash',    label: '💵 Cash' },
  { value: 'card',    label: '💳 Card' },
  { value: 'wire',    label: '🏦 Wire Transfer' },
  { value: 'account', label: '🧾 Account (wholesale credit)' },
]

// 10-hour cashier shift cap. Founder + co_founder bypass entirely
// (they're always-on via the dashboard); every other role MUST close
// their shift within this window so /dashboard/cashiers totals stay
// reconcilable.
const SHIFT_MAX_MS = 10 * 60 * 60 * 1000

function formatRemaining(ms: number): string {
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Size/unit denomination shown on every POS product card.
function unitLabel(unit: string | null | undefined): string {
  switch (unit) {
    case 'lb':   return '/lb'
    case 'case': return '/case'
    case 'each': return 'each'
    default:     return unit ? `/${unit}` : 'each'
  }
}

// ── WhatsApp click-to-chat (Tier 1, no Twilio) ──
// Builds a wa.me URL that opens WhatsApp on the cashier's device with the
// receipt body pre-typed to the customer's number. Cashier taps Send
// inside WhatsApp to deliver. Bypasses Meta/Twilio entirely — works with
// any phone that has WhatsApp installed, no opt-in, no API approval.
function buildWhatsAppReceiptText(p: {
  customerName: string
  channelLabel: string
  items: Array<{ name: string; qty: number; unit_price: number }>
  total: number
  orderId: string | null
  cashierName: string
}): string {
  const lines: string[] = []
  lines.push(`🇧🇸 *Bahamian Seafood Connection*`)
  lines.push(`${p.channelLabel} · ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`)
  lines.push('')
  if (p.customerName) lines.push(`Hi ${p.customerName.split(' ')[0]} — thanks for shopping with us today!`)
  else                lines.push(`Thanks for shopping with us today!`)
  lines.push('')
  lines.push('*Your receipt:*')
  for (const it of p.items) {
    const qty = it.qty === 1 ? '' : ` × ${it.qty}`
    lines.push(`• ${it.name}${qty} — $${(it.unit_price * it.qty).toFixed(2)}`)
  }
  lines.push('')
  lines.push(`*Total: BSD $${p.total.toFixed(2)}*`)
  if (p.orderId) {
    lines.push('')
    lines.push(`Order: ${p.orderId.slice(0, 8)}`)
    lines.push(`Full receipt: https://bscbahamas.com/receipt/${p.orderId}`)
  }
  if (p.cashierName) {
    lines.push('')
    lines.push(`Served by: ${p.cashierName}`)
  }
  lines.push('')
  lines.push(`bscbahamas.com · +1 242 361-3474`)
  return lines.join('\n')
}

// Build the WhatsApp deep-link.
//   Desktop / iPad → web.whatsapp.com/send?phone=...&text=...
//     Opens WhatsApp Web directly into the customer's chat with the
//     receipt pre-typed. Skips the wa.me "Continue to chat" landing
//     page (one fewer cashier tap).
//   Mobile (phones)  → wa.me/PHONE?text=...
//     Triggers the WhatsApp app via the OS share intent.
// Phone is normalized to E.164 then stripped of '+' (WhatsApp wants
// digits only). Returns null if the phone can't be parsed.
function buildWaMeUrl(phone: string, text: string): string | null {
  const e164 = toE164(phone)
  if (!e164) return null
  const digits = e164.replace(/^\+/, '')
  const enc = encodeURIComponent(text)
  // iPadOS 13+ sends a Mac user agent, so the simple Mobi/Android regex
  // misses iPad — that's actually what we want here (iPad treats
  // web.whatsapp.com/send the same as desktop and lands in WA Web).
  const isPhone = typeof navigator !== 'undefined'
    && /Android|iPhone|iPod/i.test(navigator.userAgent)
    && !/iPad/i.test(navigator.userAgent)
  if (isPhone) {
    return `https://wa.me/${digits}?text=${enc}`
  }
  return `https://web.whatsapp.com/send?phone=${digits}&text=${enc}`
}

// RBC terminal slip references are alphanumeric, typically 3-10 chars on the
// Plug & Play slip and up to 12 on the physical terminal. We normalize to
// uppercase + trimmed + collapsed-whitespace + only [A-Z0-9-] so cashier
// typos like " 4521 " and "4521" both reconcile against the same RBC line.
function normalizeCardRef(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '')
}
// Accept 3-24 chars after normalization. Too short → likely a typo; too
// long → not a real RBC ref and risks matching nothing during reconciliation.
function isValidCardRef(raw: string): boolean {
  const norm = normalizeCardRef(raw)
  return norm.length >= 3 && norm.length <= 24
}

interface CashierSession {
  id: string
  cashier_user_id: string
  location: string
  status: 'open' | 'closed'
  opened_at: string
  opening_float_cents: number
}

const CATEGORIES = [
  { label: 'All',     match: (_c: string) => true },
  { label: 'Seafood', match: (c: string)  => c.includes('seafood') },
  { label: 'Meat',    match: (c: string)  => c === 'meat' },
  { label: 'Produce', match: (c: string)  => c === 'produce' },
  { label: 'Grocery', match: (c: string)  => c === 'grocery' },
]

export default function POSPage() {
  const supabase = getSupabase()
  const [products, setProducts]         = useState<Product[]>([])
  const [cart, setCart]                 = useState<CartItem[]>([])
  const [search, setSearch]             = useState('')
  // Inline price-edit modal — Claff opens it from a cart line.
  const [editingPriceFor, setEditingPriceFor] = useState<{ id: string; sku: string; name: string; current_price: number; cartIndex: number } | null>(null)
  const [activeCategory, setActiveCategory] = useState('All')
  const [isWednesday, setIsWednesday]   = useState(false)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [showCart, setShowCart]         = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [terminal, setTerminal]         = useState('rbc_plug_and_play')
  const [cardRef, setCardRef]           = useState('')
  // Last card sale this shift — surfaced to the cashier when entering a new
  // card_ref so they can spot a typo'd duplicate before it lands in the
  // orders table (and double-matches an RBC settlement line at reconciliation).
  const [lastCardSale, setLastCardSale] = useState<{ card_ref: string; terminal_type: string | null; created_at: string } | null>(null)
  // Soft duplicate-warning gate: when set, the cashier must press Complete
  // Sale a second time within 8s to actually ring it through. Clears on any
  // edit to the cardRef field.
  const [dupConfirmAt, setDupConfirmAt] = useState<number | null>(null)
  const [cashTendered, setCashTendered] = useState('')
  const [wireRef, setWireRef]           = useState('')
  const [orderSuccess, setOrderSuccess] = useState(false)
  // Receipt-channel feedback shown after every completed sale so the
  // cashier (and Dedrick at /dashboard/cashiers) can see whether the
  // email/SMS receipt actually went out.
  const [lastReceipt, setLastReceipt] = useState<{ channel: 'email' | 'sms' | 'whatsapp' | 'print'; to?: string; orderId?: string; error?: string } | null>(null)
  // Item 7: separate toast for inventory-write failures (fire-and-forget
  // path that historically failed silently). 30s visibility so cashier
  // sees the order ID to email Dedrick before it auto-clears.
  const [lastInventoryWarning, setLastInventoryWarning] = useState<{ orderId: string; error: string } | null>(null)
  const [submitting, setSubmitting]     = useState(false)
  const [weightInput, setWeightInput]   = useState<{ productId: string; weight: string } | null>(null)
  const [overhead, setOverhead]         = useState<OverheadMetrics | null>(null)

  // Customer state
  const [customerPhone, setCustomerPhone]       = useState('')
  const [customerName, setCustomerName]         = useState('')
  const [customerEmail, setCustomerEmail]       = useState('')
  const [emailConsent, setEmailConsent]         = useState(false)
  // How the cashier wants the receipt delivered for THIS sale. Defaults
  // to WhatsApp because that's the Bahamian customer norm; cashier can
  // switch per sale. 'print' suppresses sending and shows the in-browser
  // printable receipt.
  const [receiptChannel, setReceiptChannel]     = useState<'whatsapp' | 'email' | 'print'>('whatsapp')
  const [foundCustomer, setFoundCustomer]       = useState<Customer | null>(null)
  // Explicit "Save customer" action — captures the customer record
  // ahead of (or independent from) a sale so history-tracking holds.
  const [savingCustomer, setSavingCustomer]     = useState(false)
  const [customerSaveToast, setCustomerSaveToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const [customerLookingUp, setCustomerLookingUp] = useState(false)
  const [customerStatus, setCustomerStatus]     = useState<'idle' | 'found' | 'new'>('idle')
  const phoneSearchTimeout = useRef<NodeJS.Timeout | null>(null)

  // Cashier shift / cash drawer
  const [cashierSession, setCashierSession] = useState<CashierSession | null>(null)
  const [userRole,        setUserRole]        = useState<string | null>(null)  // founder + co_founder bypass shift requirement
  const [nowTick,         setNowTick]         = useState(() => Date.now())     // ticks every 60s for the countdown badge
  const [shiftOpenModal,  setShiftOpenModal]  = useState(false)
  const [shiftCloseModal, setShiftCloseModal] = useState(false)
  const [openFloatDollars,setOpenFloatDollars]= useState('')
  const [openLocation,    setOpenLocation]    = useState<'nassau' | 'andros'>('nassau')
  const [openNotes,       setOpenNotes]       = useState('')
  const [closeCounted,    setCloseCounted]    = useState('')
  const [closeNotes,      setCloseNotes]      = useState('')
  const [shiftBusy,       setShiftBusy]       = useState(false)

  async function loadCashierSession() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('cash_drawer_sessions')
      .select('id, cashier_user_id, location, status, opened_at, opening_float_cents')
      .eq('cashier_user_id', user.id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setCashierSession((data as CashierSession | null) ?? null)
  }
  useEffect(() => {
    loadCashierSession()
    // Fetch current user's role so the submit handler can let founder /
    // co_founder bypass the shift-required + 10h-cap guards.
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()
      if (profile?.role) setUserRole(profile.role as string)
    })()
  }, [])

  // Minute-tick so the shift-remaining countdown badge updates live.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Derived shift age + remaining-time signals (only meaningful when a
  // shift is open). Founder + co_founder ignore these entirely.
  const shiftOpenedMs = cashierSession?.opened_at ? new Date(cashierSession.opened_at).getTime() : null
  const shiftAgeMs    = shiftOpenedMs ? nowTick - shiftOpenedMs : 0
  const shiftMsLeft   = shiftOpenedMs ? Math.max(0, SHIFT_MAX_MS - shiftAgeMs) : null
  const shiftExpired  = shiftOpenedMs != null && shiftAgeMs > SHIFT_MAX_MS
  const shiftIsBypassed = userRole === 'founder' || userRole === 'co_founder'

  async function handleOpenShift() {
    const dollars = parseFloat(openFloatDollars)
    if (isNaN(dollars) || dollars < 0) { alert('Enter the opening float (BSD).'); return }
    setShiftBusy(true)
    const { data, error } = await supabase.rpc('open_cashier_session', {
      p_location:    openLocation,
      p_float_cents: Math.round(dollars * 100),
      p_notes:       openNotes.trim() || null,
    })
    setShiftBusy(false)
    if (error) { alert('Open shift failed: ' + error.message); return }
    const row = Array.isArray(data) ? data[0] : data
    setCashierSession(row as CashierSession)
    setShiftOpenModal(false)
    setOpenFloatDollars(''); setOpenNotes('')
  }

  async function handleCloseShift() {
    if (!cashierSession) return
    const counted = parseFloat(closeCounted)
    if (isNaN(counted) || counted < 0) { alert('Enter the counted cash (BSD).'); return }
    setShiftBusy(true)
    const sessionId = cashierSession.id
    const { error } = await supabase.rpc('close_cashier_session', {
      p_session_id:    sessionId,
      p_counted_cents: Math.round(counted * 100),
      p_notes:         closeNotes.trim() || null,
    })
    setShiftBusy(false)
    if (error) { alert('Close shift failed: ' + error.message); return }
    // Fire-and-forget variance alert — server checks threshold, emails admins.
    fetch('/api/cashiers/variance-alert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({ session_id: sessionId }),
    }).catch((err) => console.warn('Variance alert failed:', err))
    setCashierSession(null)
    setShiftCloseModal(false)
    setCloseCounted(''); setCloseNotes('')
    alert('Shift closed. Variance saved — check /dashboard/cashiers for the summary.')
  }

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const today = new Date().getDay()
      setIsWednesday(today === 3)

      // Fetch products — get the nassau_pos snapshot as the retail price.
      // Also pull special_price + window so a closed-date special overrides
      // the regular price at POS just like it does on /market.
      const { data: productsRaw, error: prodErr } = await supabase
        .from('products')
        .select('id, sku, barcode, name, category, is_bsc_processed, unit_of_measure, unit_type, special_price, special_starts_at, special_ends_at, special_label, product_pricing!inner(manual_unit_price)')
        .eq('sell_nassau', true)
        .eq('status', 'active')
        .eq('product_pricing.channel', 'nassau_pos')
        .eq('product_pricing.is_current', true)
        .eq('product_pricing.is_active', true)
        .order('name')

      if (prodErr) throw prodErr

      const productIds = (productsRaw ?? []).map((p: any) => p.id)

      // Separate fetch for local_wholesale prices so we can auto-upgrade
      // at 10+ lbs of one product / by the case. Missing wholesale price
      // = no auto-upgrade for that product (retail price always applies).
      let wholesaleMap = new Map<string, number>()
      if (productIds.length > 0) {
        const { data: wholesaleRaw } = await supabase
          .from('product_pricing')
          .select('product_id, manual_unit_price')
          .in('product_id', productIds)
          .eq('channel', 'local_wholesale')
          .eq('is_current', true)
          .eq('is_active', true)
        for (const row of (wholesaleRaw ?? []) as { product_id: string; manual_unit_price: number }[]) {
          wholesaleMap.set(row.product_id, Number(row.manual_unit_price))
        }
      }

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

      const nowMs = Date.now()
      const merged: Product[] = (productsRaw ?? []).map((p: any) => {
        const pricing = Array.isArray(p.product_pricing) ? p.product_pricing[0] : p.product_pricing
        const promo   = promoMap.get(p.id)
        // Closed-date special — applies if NOW() is within the window.
        // When active, special_price feeds priceCartLine.promo_price so it
        // wins over the weekly Wednesday promo only if higher priority; we
        // pick whichever is lower (best for the customer).
        const startMs = p.special_starts_at ? new Date(p.special_starts_at).getTime() : -Infinity
        const endMs   = p.special_ends_at   ? new Date(p.special_ends_at).getTime()   :  Infinity
        const specialActive = p.special_price != null && startMs <= nowMs && nowMs <= endMs
        const weeklyPromoPrice  = promo ? Number(promo.promo_price) : null
        const specialPriceValue = specialActive ? Number(p.special_price) : null
        // If both apply, take the lower (customer-best) price.
        const effectivePromo = (weeklyPromoPrice != null && specialPriceValue != null)
          ? Math.min(weeklyPromoPrice, specialPriceValue)
          : (weeklyPromoPrice ?? specialPriceValue)
        const effectiveLabel = effectivePromo === specialPriceValue && specialActive
          ? (p.special_label ?? 'SPECIAL')
          : promo?.display_label ?? null
        return {
          id: p.id, sku: p.sku, barcode: p.barcode, name: p.name,
          category: p.category, is_bsc_processed: p.is_bsc_processed,
          sell_price:      Number(pricing?.manual_unit_price ?? 0),
          wholesale_price: wholesaleMap.get(p.id) ?? null,
          promo_price:     effectivePromo,
          promo_label:     effectiveLabel,
          // unit_of_measure is the source of truth (a DB trigger keeps
          // unit_type synced). Read it so lb products always weigh-in with
          // decimals even if unit_type ever drifts.
          is_per_lb:       (p.unit_of_measure ?? p.unit_type) === 'lb',
          unit:            (p.unit_of_measure ?? p.unit_type ?? 'each') as string,
        }
      })

      setProducts(merged)
    } catch (err: any) {
      setError(plainError(err) || 'Failed to load catalog')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { loadCatalog() }, [loadCatalog])

  // Deep-link: /pos?focus=<product_id> (from /products "🛒 Sell at POS").
  // Once the catalog finishes loading, auto-add the requested product.
  // Per-lb products open the weight input prompt; unit products add qty=1
  // and pop the cart drawer. We fire exactly once per session.
  const focusFiredRef = useRef(false)
  useEffect(() => {
    if (focusFiredRef.current) return
    if (products.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const focus  = params.get('focus')
    if (!focus) return
    focusFiredRef.current = true

    const target = products.find(p => p.id === focus)
    if (!target) {
      alert("That product isn't available at Nassau POS. It may be inactive or missing a nassau_pos price on /products.")
    } else {
      addToCart(target)
      if (!target.is_per_lb) setShowCart(true)
    }

    // Strip the param so a page refresh doesn't re-add the line.
    const cleanUrl = window.location.pathname + window.location.hash
    window.history.replaceState({}, '', cleanUrl)
  }, [products])

  // Fetch overhead metrics once per session so each sale can persist its
  // expense_allocation / bill_casale_share / net_profit. Falls back silently
  // if expenses table is empty — overhead stays null, profit fields write null.
  useEffect(() => {
    fetchOverheadMetrics().then(setOverhead).catch(() => setOverhead(null))
  }, [])

  // Phone normalize — mirror of bsc_normalize_phone() so writes
  // populate phone_e164 alongside the legacy `phone` column.
  function normalizePhone(raw: string): string | null {
    if (!raw || !raw.trim()) return null
    let cleaned = raw.replace(/[^0-9+]/g, '')
    if (cleaned.startsWith('+')) return cleaned
    cleaned = cleaned.replace(/\+/g, '')
    if (cleaned.length === 7) return `+1242${cleaned}`
    if (cleaned.length === 10) return `+1${cleaned}`
    if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`
    return cleaned ? `+${cleaned}` : null
  }

  // Phone lookup — uses bsc_lookup_customer_by_phone RPC. The RPC
  // normalizes 7-digit → +1242 and matches on phone_e164. After we
  // find the id, fetch the full row so we still have total_orders +
  // total_spent + email consent flags for the rest of the flow.
  function handlePhoneChange(val: string) {
    setCustomerPhone(val)
    setFoundCustomer(null)
    setCustomerStatus('idle')
    setCustomerName('')
    setCustomerEmail('')
    setEmailConsent(false)
    if (phoneSearchTimeout.current) clearTimeout(phoneSearchTimeout.current)
    if (val.length < 7) return
    phoneSearchTimeout.current = setTimeout(async () => {
      setCustomerLookingUp(true)
      const { data: matches } = await supabase.rpc('bsc_lookup_customer_by_phone', { p_raw_phone: val.trim() })
      const match = Array.isArray(matches) && matches.length > 0 ? matches[0] : null
      if (!match) {
        setCustomerLookingUp(false)
        setCustomerStatus('new')
        return
      }
      // Fetch the rest of the row (consent + lifetime totals) using the matched id.
      const { data: full } = await supabase
        .from('customers')
        .select('id, full_name, phone, email, email_marketing_consent, total_orders, total_spent')
        .eq('id', match.id)
        .maybeSingle()
      setCustomerLookingUp(false)
      const row = (full ?? { ...match, total_orders: 0, total_spent: 0 }) as Customer
      setFoundCustomer(row)
      setCustomerName(row.full_name)
      setCustomerEmail(row.email ?? '')
      setEmailConsent(Boolean(row.email_marketing_consent))
      setCustomerStatus('found')
    }, 350)
  }

  function resetCheckout() {
    setCustomerPhone('')
    setCustomerName('')
    setCustomerEmail('')
    setEmailConsent(false)
    setFoundCustomer(null)
    setCustomerStatus('idle')
    setCardRef('')
    setCashTendered('')
    setWireRef('')
    setPaymentMethod('cash')
  }

  const activeCat = CATEGORIES.find(c => c.label === activeCategory) ?? CATEGORIES[0]
  const filtered  = products.filter(p => {
    const matchCat    = activeCat.match(p.category)
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search)
    return matchCat && matchSearch
  })

  // Per-line effective pricing. Recomputed every render so a quantity
  // bump that crosses 10 lbs auto-flips to wholesale immediately.
  function lineInfo(item: CartItem): { count: number; pricing: CartLinePricing; line_subtotal: number } {
    const snap: ProductPriceSnapshot = {
      retail_price:    item.product.sell_price,
      wholesale_price: item.product.wholesale_price,
      promo_price:     item.product.promo_price,
    }
    const count   = lineCount(item.quantity, item.weight_lb)
    const pricing = priceCartLine(snap, count, item.product.is_per_lb ? 'lb' : 'each')
    return { count, pricing, line_subtotal: Math.round(pricing.unit_price * count * 100) / 100 }
  }

  function addToCart(product: Product, weightLb?: number) {
    if (product.is_per_lb && !weightLb) {
      setWeightInput({ productId: product.id, weight: '' })
      return
    }
    setCart(prev => {
      if (!product.is_per_lb) {
        const idx = prev.findIndex(i => i.product.id === product.id)
        if (idx > -1) return prev.map((item, i) => i === idx ? { ...item, quantity: item.quantity + 1 } : item)
      }
      return [...prev, { product, quantity: 1, weight_lb: weightLb }]
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

  const subtotal      = cart.reduce((sum, item) => sum + lineInfo(item).line_subtotal, 0)
  const vatAmount     = 0
  const total         = subtotal + vatAmount
  const cartCount     = cart.reduce((sum, item) => sum + item.quantity, 0)
  const cashTenderedNum = parseFloat(cashTendered) || 0
  const changeDue     = paymentMethod === 'cash' && cashTenderedNum >= total ? cashTenderedNum - total : 0
  const checkoutReady = paymentMethod === 'cash' ? (cashTenderedNum >= total && total > 0) : true

  // Explicit "Save customer" — fires the server-side /api/pos/save-customer
  // route so RLS doesn't block the cashier. Cashier sees an inline toast
  // with the resulting customer's lifetime totals. Founder AI receives
  // the save via ai_writes (audit pipeline already wired).
  async function handleSaveCustomer() {
    const nameClean  = customerName.trim()
    const phoneClean = customerPhone.trim()
    const emailClean = customerEmail.trim().toLowerCase()
    if (!nameClean) { setCustomerSaveToast({ ok: false, msg: '⚠ Name required' }); setTimeout(() => setCustomerSaveToast(null), 5000); return }
    if (!phoneClean && !emailClean) { setCustomerSaveToast({ ok: false, msg: '⚠ Phone OR email required' }); setTimeout(() => setCustomerSaveToast(null), 5000); return }
    setSavingCustomer(true); setCustomerSaveToast(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) { setCustomerSaveToast({ ok: false, msg: '⚠ Sign-in expired — refresh.' }); return }
      const res = await fetch('/api/pos/save-customer', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body:    JSON.stringify({
          name:           nameClean,
          phone:          phoneClean || null,
          email:          emailClean || null,
          origin_channel: 'nassau_pos',
          email_consent:  emailConsent,
        }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) {
        setCustomerSaveToast({ ok: false, msg: `⚠ ${j.error ?? `Failed (${res.status})`}` })
        return
      }
      // Mirror the "found customer" state so the cashier sees the success
      // panel + lifetime stats immediately.
      setFoundCustomer({
        id:                       j.customer_id,
        full_name:                j.full_name,
        phone:                    phoneClean || null,
        phone_e164:               null,
        email:                    emailClean || null,
        total_orders:             j.total_orders ?? 0,
        total_spent:              j.total_spent ?? 0,
        email_marketing_consent:  emailConsent && !!emailClean,
      } as unknown as Customer)
      setCustomerStatus('found')
      setCustomerSaveToast({
        ok: true,
        msg: `✓ ${j.was_new ? 'Created' : 'Updated'} ${j.full_name} · ${j.total_orders} order${j.total_orders === 1 ? '' : 's'} · $${Number(j.total_spent).toFixed(2)} lifetime`,
      })
      setTimeout(() => setCustomerSaveToast(null), 6000)
    } catch (e) {
      setCustomerSaveToast({ ok: false, msg: `⚠ ${e instanceof Error ? e.message : 'Save failed'}` })
    } finally {
      setSavingCustomer(false)
    }
  }

  async function handleCheckout() {
    if (!cart.length) return

    if (paymentMethod === 'cash' && cashTenderedNum < total) {
      alert(
        `Cash tendered ($${cashTenderedNum.toFixed(2)}) is less than the order total ` +
        `($${total.toFixed(2)}). Sale blocked — collect $${(total - cashTenderedNum).toFixed(2)} more.`
      )
      return
    }

    setSubmitting(true)

    // Founder + co_founder are always-on via the dashboard and can ring
    // any sale without a cash_drawer_session. Every other role MUST open
    // a shift, and the shift expires after 10 hours so /dashboard/cashiers
    // totals stay reconcilable.
    if (!shiftIsBypassed) {
      if (!cashierSession?.id) {
        alert('Open a shift before ringing a sale. Tap "🔴 No shift" → enter opening cash.')
        setSubmitting(false)
        return
      }
      if (shiftExpired) {
        alert('Shift has been open for more than 10 hours. Close it first — tap the shift badge → Close Shift → count the drawer. Open a new shift to keep ringing.')
        setSubmitting(false)
        return
      }
    }

    // Card sales require a reference from the RBC terminal slip for
    // RBC daily reconciliation (Items 6 receipt display + Task #77 RBC
    // ingest cron post-launch). Applies to ALL roles — founder included.
    if (paymentMethod === 'card') {
      if (!cardRef.trim()) {
        alert('Card reference required. Type the reference number from the RBC terminal slip, then Complete Sale.')
        setSubmitting(false)
        return
      }
      if (!isValidCardRef(cardRef)) {
        alert('Card reference looks malformed. Use the alphanumeric reference shown on the RBC terminal slip (3–24 characters).')
        setSubmitting(false)
        return
      }
      const normRef = normalizeCardRef(cardRef)
      // Dedupe check — same normalized ref + terminal within the last 12h
      // is almost certainly a re-ring or a typo. Soft-warn: cashier must
      // tap Complete Sale a second time within 8s to actually ring it
      // through. Prevents accidental double-billing during reconciliation.
      try {
        const sinceIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
        const { data: dups } = await supabase
          .from('orders')
          .select('id, created_at, terminal_type, card_ref')
          .eq('card_ref', normRef)
          .eq('order_type', 'pos_sale_nassau')
          .gte('created_at', sinceIso)
          .limit(1)
        const conflict = (dups && dups.length > 0) ? dups[0] : null
        const now = Date.now()
        const armed = dupConfirmAt != null && (now - dupConfirmAt) < 8000
        if (conflict && !armed) {
          setDupConfirmAt(now)
          alert(`Heads up — card reference ${normRef} was already used at ${new Date(conflict.created_at).toLocaleTimeString()}. If this is a NEW sale (RBC issued a fresh ref) tap Complete Sale again within 8 seconds to ring it through. Otherwise change the ref to match the slip in your hand.`)
          setSubmitting(false)
          return
        }
      } catch (err) {
        // Don't block sale on a dedupe-lookup failure (Supabase blip etc).
        // Just log and move on; reconciliation can still catch a real
        // double via the RBC ingest cron.
        console.warn('Card-ref dedupe check failed (non-fatal):', err)
      }
    }

    // Item 7: Track INSERT success outside the try so the outer catch can
    // distinguish "sale not saved — safe to retry" from "sale saved but a
    // side-effect failed — DO NOT re-ring (would duplicate)."
    let savedOrderId: string | null = null

    try {
      let customerId: string | null = null
      const phoneClean = customerPhone.trim()
      const nameClean  = customerName.trim()
      const emailClean = customerEmail.trim().toLowerCase()
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean) ? emailClean : ''

      if (phoneClean && nameClean) {
        const normalized = normalizePhone(phoneClean)
        if (foundCustomer) {
          // Item 9 / Task #74: returning-customer totals + opportunistic
          // backfill now route through /api/pos/record-customer-purchase
          // (service-role). The previous client-side UPDATE was silently
          // RLS-blocked for non-founder cashiers (Bill / Roselins /
          // andros_staff) — every sale they rang for a returning customer
          // was leaving total_orders + total_spent stale.
          //
          // Fire-and-forget: the sale is already saved by the time we get
          // here (Item 7 atomic savedOrderId). Failure here surfaces as
          // the "Sale saved but follow-up failed" alert path, not a
          // re-ringable error.
          customerId = foundCustomer.id
          try {
            const { data: { session } } = await supabase.auth.getSession()
            const accessToken = session?.access_token
            if (accessToken) {
              await fetch('/api/pos/record-customer-purchase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({
                  customer_id:     foundCustomer.id,
                  order_total_bsd: total,
                  phone_e164:      normalized || null,
                  email:           validEmail || null,
                  email_consent:   emailConsent && !!validEmail && !foundCustomer.email_marketing_consent,
                  consent_source:  'nassau_pos',
                }),
              })
            }
          } catch (err) {
            // Don't throw — sale is already saved. Surfacing via console
            // here matches the inventory-IIFE pattern at line ~735.
            console.warn('Customer purchase record failed (non-fatal):', err)
          }
        } else {
          // No matching customer in state — route through /api/pos/save-customer
          // (service-role, bypasses RLS). The previous inline INSERT used the
          // anon-key client which was silently blocked by RLS — that's why
          // every order rang through this branch saved with customer_id = NULL.
          // We fail loud here instead of silently writing a null customer_id.
          const { data: { session } } = await supabase.auth.getSession()
          const accessToken = session?.access_token
          if (!accessToken) throw new Error('Sign-in expired — sign in again before ringing this sale.')
          const consentNow = emailConsent && !!validEmail
          const saveRes = await fetch('/api/pos/save-customer', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body:    JSON.stringify({
              name:           nameClean,
              phone:          phoneClean,
              email:          validEmail || null,
              origin_channel: 'nassau_pos',
              email_consent:  consentNow,
            }),
          })
          const saveJson = await saveRes.json().catch(() => ({}))
          if (!saveRes.ok || !saveJson.ok || !saveJson.customer_id) {
            throw new Error(`Customer save failed: ${saveJson.error ?? `HTTP ${saveRes.status}`}`)
          }
          customerId = saveJson.customer_id
        }
      }

      let adminNotes = ''
      if (paymentMethod === 'card') {
        const terminalLabel = TERMINALS.find(t => t.value === terminal)?.label ?? terminal
        adminNotes = cardRef ? `Card ref: ${cardRef} | Terminal: ${terminalLabel}` : `Terminal: ${terminalLabel}`
      } else if (paymentMethod === 'cash') {
        adminNotes = `Cash tendered: $${cashTenderedNum.toFixed(2)} | Change: $${changeDue.toFixed(2)}`
      } else if (paymentMethod === 'wire') {
        adminNotes = wireRef ? `Wire ref: ${wireRef}` : 'Wire transfer'
      }

      const items = cart.map(item => {
        const { pricing, line_subtotal } = lineInfo(item)
        return {
          product_id: item.product.id, sku: item.product.sku, name: item.product.name,
          quantity:   item.quantity,
          unit_price: pricing.unit_price,
          weight_lb:  item.weight_lb ?? null,
          line_total: line_subtotal,
          // New: tells the receipt + reports which channel applied + whether wholesale auto-upgraded.
          applied_channel:        pricing.applied_channel,
          upgraded_to_wholesale:  pricing.upgraded_to_wholesale,
          promo_applied: item.product.promo_price !== null,
          promo_label:   item.product.promo_label ?? null,
        }
      })

      const profit = overhead
        ? computeProfitSplit(total, NASSAU_POS_MARGIN, overhead.expense_rate)
        : null

      const { data: { user } } = await supabase.auth.getUser()
      // Account-credit orders don't move money today — mark as unpaid so AR can chase them.
      const paymentStatus = paymentMethod === 'account' ? 'unpaid' : 'paid_in_full'
      const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({
        order_type: 'pos_sale_nassau',
        location: 'bsc_marketplace_nassau', channel: 'nassau_pos',
        wholesale_items: items,
        subtotal, vat_amount: vatAmount, total,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        terminal_type:  paymentMethod === 'card' ? terminal : null,
        card_ref:       paymentMethod === 'card' ? normalizeCardRef(cardRef) : null,  // NEW — structured column added by migration 20260525000000
        admin_notes: adminNotes, status: 'completed',                       // back-compat: keeps writing the buried "Card ref: XXX" string for any legacy reader
        customer_id:    customerId,
        customer_name:  nameClean || null,
        customer_phone: phoneClean || null,
        // Cashier shift linkage — the admin dashboard joins on these to show
        // each cashier's drawer activity in real time.
        cashier_session_id: cashierSession?.id ?? null,
        cashier_user_id:    user?.id ?? null,
        expense_allocation: profit?.expense_allocation ?? null,
        bill_casale_share:  profit?.bill_casale_share  ?? null,
        net_profit:         profit?.net_profit         ?? null,
      }).select('id').single()
      if (orderErr) throw orderErr

      const orderId = newOrder?.id
      if (!orderId) throw new Error('Order INSERT returned no id')
      savedOrderId = orderId   // Item 7: from here on, the sale IS in the DB

      // Inventory decrement at NASSAU location. Fire-and-forget per the
      // /api/sales/inventory-write contract — a failed write must never
      // block a completed sale. Mirrors /pos-andros and /checkout wiring.
      // owner_id is resolved server-side from products.owner_id (Build 1).
      ;(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
          await fetch('/api/sales/inventory-write', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              location_code: 'NASSAU',
              order_id:      orderId,
              channel:       'nassau_pos',
              items: items.map((i: any) => ({
                product_id: i.product_id,
                sku:        i.sku,
                qty:        i.weight_lb ?? i.quantity ?? 1,
                unit:       i.weight_lb != null ? 'lb' : 'unit',
              })),
            }),
          })
        } catch (err) {
          console.warn('Inventory decrement failed:', err)
          // Item 7: surface to the cashier UI so they immediately know
          // to email Dedrick. Auto-clears after 30s. orderId is captured
          // from the outer scope (closure) — guaranteed set here because
          // the IIFE only fires after a successful INSERT.
          const errMsg = err instanceof Error ? err.message : 'fetch failed'
          if (orderId) {
            setLastInventoryWarning({ orderId, error: errMsg })
            setTimeout(() => setLastInventoryWarning(null), 30000)
          }
        }
      })()

      // Auto-send receipt: email if on file, SMS if not, print fallback.
      // Result is visible to the cashier via lastReceipt state so failures
      // don't get hidden by the fire-and-forget pattern.
      // What the receipt API actually delivered via (may differ from the
      // cashier's preference if e.g. WhatsApp failed and SMS fallback hit,
      // or the customer had no email and we routed to print).
      let deliveredChannel: 'email' | 'sms' | 'whatsapp' | 'print' = 'print'
      let receiptTo: string | undefined
      let receiptError: string | undefined
      if (orderId) {
        try {
          // ── WhatsApp click-to-chat (Tier 1) ──
          // Cashier picked WhatsApp + we have a phone → bypass the
          // server send entirely. Open wa.me with the receipt body
          // pre-typed; cashier taps Send inside WhatsApp.
          if (receiptChannel === 'whatsapp' && phoneClean) {
            const text = buildWhatsAppReceiptText({
              customerName: nameClean,
              channelLabel: 'BSC Marketplace Nassau',
              items: items.map((i: any) => ({
                name:       i.name,
                qty:        i.quantity ?? i.qty ?? 1,
                unit_price: i.unit_price ?? i.price ?? 0,
              })),
              total,
              orderId,
              cashierName: user?.user_metadata?.full_name || user?.email || '',
            })
            const waUrl = buildWaMeUrl(phoneClean, text)
            if (waUrl) {
              window.open(waUrl, '_blank')
              deliveredChannel = 'whatsapp'
              receiptTo        = phoneClean
            } else {
              receiptError = 'Could not normalize phone for WhatsApp.'
            }
          }
          const { data: { session } } = await supabase.auth.getSession()
          const accessToken = session?.access_token
          // Skip the API send when we already handled it via click-to-chat
          // OR when the cashier picked print.
          const skipApiSend = (receiptChannel === 'whatsapp' && phoneClean) || receiptChannel === 'print'
          if (!skipApiSend && accessToken && (validEmail || phoneClean)) {
            const res = await fetch('/api/pos/receipt', {
              method: 'POST',
              headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                order_id:       orderId,
                customer_id:    customerId,
                customer_email: validEmail || null,
                customer_phone: phoneClean || null,
                customer_name:  nameClean || null,
                channel_label:  'BSC Marketplace Nassau',
                cashier_name:   user?.user_metadata?.full_name || user?.email || null,
                subtotal, vat: vatAmount, total,
                // Payment info (Item 6) — receipt email/SMS + public receipt
                // page render these so customers + RBC reconciliation can
                // match each sale to its terminal slip.
                payment_method: paymentMethod,
                card_ref:       paymentMethod === 'card' ? normalizeCardRef(cardRef) : null,
                terminal_type:  paymentMethod === 'card' ? terminal              : null,
                // Cashier's chosen channel for this sale — server falls back
                // (WhatsApp → SMS → email → print) if the preferred channel
                // can't be honored (e.g. WhatsApp picked but no phone).
                prefer_channel: receiptChannel,
                items: items.map((i: any) => ({
                  name:       i.name,
                  qty:        i.quantity ?? i.qty ?? 1,
                  unit_price: i.unit_price ?? i.price ?? 0,
                })),
              }),
            })
            const j = await res.json().catch(() => ({}))
            if (j?.ok && (j.channel === 'email' || j.channel === 'sms' || j.channel === 'whatsapp')) {
              deliveredChannel = j.channel
              receiptTo        = j.to
            } else if (!j?.ok) {
              receiptError = j?.error ?? `HTTP ${res.status}`
            }
          } else if (receiptChannel === 'print') {
            // Cashier explicitly chose print — skip the API call entirely.
            deliveredChannel = 'print'
          } else if (!validEmail && !phoneClean) {
            // No customer info — print receipt is the right answer.
          }
        } catch (err) {
          receiptError = err instanceof Error ? err.message : 'fetch failed'
          console.warn('Receipt send failed:', err)
        }
      }

      // If no email + no phone (or both failed), or cashier chose print,
      // open the in-browser printable receipt.
      if (orderId && deliveredChannel === 'print') {
        window.open(`/receipt/${orderId}`, '_blank')
      }

      // Surface the result so Claff/TJ see it for ~10 seconds.
      setLastReceipt({ channel: deliveredChannel, to: receiptTo, orderId, error: receiptError })
      // Keep the toast up longer when there's an error so the cashier
      // (and Dedrick) can actually read the failure reason. Success
      // toasts can disappear in 10s as before.
      setTimeout(() => setLastReceipt(null), receiptError ? 30000 : 10000)

      // Persist the last-card-sale hint so the next ring can spot a typo
      // duplicate before submit. Only set when this sale was a card —
      // cash/wire/account don't need the reminder.
      if (paymentMethod === 'card' && savedOrderId) {
        setLastCardSale({
          card_ref: normalizeCardRef(cardRef),
          terminal_type: terminal,
          created_at: new Date().toISOString(),
        })
      }
      setDupConfirmAt(null)
      setOrderSuccess(true)
      setCart([])
      resetCheckout()
      setShowCheckout(false)
      setShowCart(false)
      setTimeout(() => setOrderSuccess(false), 10000)
    } catch (err: any) {
      // Item 7: distinguish "sale not saved (safe to retry)" from "sale
      // saved but a side-effect failed (DO NOT re-ring — duplicates)."
      const msg = plainError(err) || 'Unknown error'
      if (savedOrderId) {
        alert(
          `✓ Sale ${savedOrderId.slice(0, 8)} was SAVED.\n\n` +
          `But a follow-up step failed: ${msg}\n\n` +
          `Do NOT re-ring this sale. Open /pos/sales-history to retry the receipt manually or flag stock to admin.`
        )
      } else {
        alert(
          `Order failed: ${msg}\n\n` +
          `The sale was NOT saved — try again. If it keeps failing, take cash + write a paper receipt + call Dedrick.`
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* Universal Inventory Intake FAB — cashier role tag */}
      <AddInventoryButton role="cashier" variant="fab" />

      {/* Inline price-edit modal — opens from any cart line's ✏ button */}
      {editingPriceFor && (
        <EditPriceModal
          product={editingPriceFor}
          channelSet="nassau_pos"
          onClose={() => setEditingPriceFor(null)}
          onSaved={(newPrice) => {
            // Optimistic local update so the cart reflects Claff's new
            // price instantly. The catalog will fully refresh on the
            // next load() (or when she scans the same product again).
            setCart(prev => prev.map((c, idx) => {
              if (idx !== editingPriceFor.cartIndex) return c
              return { ...c, product: { ...c.product, sell_price: newPrice } }
            }))
          }}
        />
      )}

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center rounded-lg bg-white shadow-sm shrink-0" style={{ height: 44, padding: 4 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/bsc-marketplace-logo.png" alt="BSC Market Place" style={{ height: 36, width: 'auto', display: 'block' }} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: '#f5c518' }}>Nassau POS</p>
              <p className="text-[11px] text-gray-400 truncate">Fire Trail Road · Register</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* WhatsApp Web link — opens web.whatsapp.com in a popup so
                the cashier can scan the QR with the BSC business phone
                ONCE per terminal. After scan, every WhatsApp receipt
                click-to-chat opens here. Embedding WhatsApp Web in an
                iframe isn't possible (X-Frame-Options: DENY). */}
            <button
              onClick={() => {
                window.open(
                  'https://web.whatsapp.com',
                  'bsc_wa_web',
                  'width=900,height=700,left=200,top=100,noopener,noreferrer',
                );
              }}
              title="Open WhatsApp Web (scan QR with the BSC business phone — one-time setup per terminal)"
              className="text-xs font-bold px-2.5 py-1.5 rounded-lg transition"
              style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.4)' }}
            >
              💬 Link WhatsApp
            </button>
            {isWednesday && (
              <span className="text-xs font-bold px-2 py-1 rounded-full animate-pulse" style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                🐟 Wed Special
              </span>
            )}
            {/* Shift status chip — open/close drawer + 10h countdown
                (countdown hidden for founder/co_founder who are exempt
                from the cap). */}
            {shiftIsBypassed ? (
              <span
                className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                style={{ backgroundColor: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid #f5c518' }}
                title="Always-on shift via /dashboard">
                ⭐ Always on
              </span>
            ) : cashierSession ? (
              <button onClick={() => setShiftCloseModal(true)}
                className={[
                  'text-xs font-bold px-2.5 py-1.5 rounded-lg',
                  shiftExpired ? 'animate-pulse' : '',
                ].join(' ')}
                style={{
                  backgroundColor:
                    shiftExpired                                  ? 'rgba(239,68,68,0.20)' :
                    shiftMsLeft != null && shiftMsLeft <= 30*60*1000 ? 'rgba(239,68,68,0.15)' :
                    shiftMsLeft != null && shiftMsLeft <= 60*60*1000 ? 'rgba(234,179,8,0.15)' :
                    'rgba(34,197,94,0.15)',
                  color:
                    shiftExpired                                  ? '#f87171' :
                    shiftMsLeft != null && shiftMsLeft <= 30*60*1000 ? '#fca5a5' :
                    shiftMsLeft != null && shiftMsLeft <= 60*60*1000 ? '#fbbf24' :
                    '#4ade80',
                  border:
                    shiftExpired                                  ? '1px solid #ef4444' :
                    shiftMsLeft != null && shiftMsLeft <= 30*60*1000 ? '1px solid #ef4444' :
                    shiftMsLeft != null && shiftMsLeft <= 60*60*1000 ? '1px solid #eab308' :
                    '1px solid #16a34a',
                }}
                title={`Open ${cashierSession.location} · float $${(cashierSession.opening_float_cents/100).toFixed(2)} · opened ${new Date(cashierSession.opened_at).toLocaleTimeString()}`}>
                {shiftExpired
                  ? '🔴 Shift expired — close now'
                  : `🟢 Shift · ${formatRemaining(shiftMsLeft ?? 0)} left`}
              </button>
            ) : (
              <button onClick={() => setShiftOpenModal(true)}
                className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                style={{ backgroundColor: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid #f87171' }}>
                🔴 No shift
              </button>
            )}
            <button onClick={() => setShowCart(true)} className="relative bg-gray-800 rounded-xl px-4 py-2 text-sm font-semibold" style={{ color: '#f5c518' }}>
              🛒 Cart
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold" style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="mt-3">
          <input type="text" placeholder="Search product or scan SKU..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 text-white rounded-xl px-4 py-2 text-sm border border-gray-700 focus:outline-none focus:border-yellow-400" />
        </div>
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {CATEGORIES.map(cat => (
            <button key={cat.label} onClick={() => setActiveCategory(cat.label)}
              className="shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
              style={activeCategory === cat.label
                ? { backgroundColor: '#f5c518', color: '#060d1f', fontWeight: 700 }
                : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
              {cat.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Wednesday banner ── */}
      {isWednesday && (
        <div className="mx-4 mt-4 rounded-xl p-3 text-center" style={{ backgroundColor: '#1a1500', border: '1px solid #f5c518' }}>
          <p className="text-sm font-bold" style={{ color: '#f5c518' }}>🐟 Wednesday Salmon Special — Prices applied automatically</p>
          <p className="text-xs text-gray-400 mt-1">4oz $2.75 · 6oz $5.50 · 8oz $7.20 · 2-3lb Fillet $26.00/piece</p>
        </div>
      )}

      {/* ── Order success toast ── */}
      {orderSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl px-6 py-3 text-sm font-bold shadow-xl" style={{ backgroundColor: '#16a34a', color: 'white' }}>
          ✓ Sale saved successfully
        </div>
      )}

      {/* ── Receipt-channel feedback ── */}
      {lastReceipt && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-xl px-5 py-3 text-xs font-bold shadow-xl max-w-md text-center"
          style={{
            backgroundColor: lastReceipt.error ? '#7f1d1d' : lastReceipt.channel === 'whatsapp' ? '#15803d' : lastReceipt.channel === 'email' ? '#16a34a' : lastReceipt.channel === 'sms' ? '#0369a1' : '#525252',
            color: 'white',
          }}>
          {lastReceipt.error
            ? `⚠ Receipt FAILED: ${lastReceipt.error}${lastReceipt.orderId ? ` — open /receipt/${lastReceipt.orderId.slice(0, 8)} manually` : ''}`
            : lastReceipt.channel === 'whatsapp' ? `💬 WhatsApp opened${lastReceipt.to ? ` for ${lastReceipt.to}` : ''} — tap Send inside WhatsApp`
            : lastReceipt.channel === 'email' ? `📧 Email receipt sent${lastReceipt.to ? ` to ${lastReceipt.to}` : ''}`
            : lastReceipt.channel === 'sms'   ? `📱 SMS receipt sent${lastReceipt.to ? ` to ${lastReceipt.to}` : ''}`
            : `🖨 Print receipt opened`}
          <button onClick={() => setLastReceipt(null)} className="ml-3 opacity-70 hover:opacity-100" aria-label="Dismiss">×</button>
        </div>
      )}

      {/* ── Inventory-write warning (Item 7) ──
          Renders below the receipt toast when fire-and-forget stock
          decrement failed. Amber so cashier sees it's not a sale
          failure (sale already saved) but still needs admin action. */}
      {lastInventoryWarning && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-50 rounded-xl px-5 py-3 text-xs font-bold shadow-xl max-w-md text-center"
          style={{ backgroundColor: '#92400e', color: 'white', border: '1px solid #f59e0b' }}>
          ⚠ Sale saved — stock NOT updated. Email Dedrick:
          <span style={{ fontFamily: 'monospace', marginLeft: 6 }}>order {lastInventoryWarning.orderId.slice(0, 8)}</span>
          <button onClick={() => setLastInventoryWarning(null)} className="ml-3 opacity-70 hover:opacity-100" aria-label="Dismiss">×</button>
        </div>
      )}

      {/* ── Product grid ── */}
      <main className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-400 text-sm animate-pulse">Loading catalog...</p>
          </div>
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
              const hasPromo     = product.promo_price !== null
              return (
                <button key={product.id} onClick={() => addToCart(product)}
                  className="relative bg-gray-900 border rounded-xl p-3 text-left active:scale-95 transition-transform"
                  style={{ borderColor: hasPromo ? '#f5c518' : '#374151' }}>
                  {hasPromo && (
                    <span className="absolute top-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                      Special
                    </span>
                  )}
                  {product.is_bsc_processed && (
                    <span className="absolute top-2 left-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-900 text-blue-300">BSC</span>
                  )}
                  <p className="text-xs text-gray-500 mt-5 mb-1">{product.sku}</p>
                  <p className="text-sm font-semibold text-white leading-tight line-clamp-2">{product.name}</p>
                  <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-base font-bold" style={{ color: '#f5c518' }}>${displayPrice.toFixed(2)}</span>
                    {hasPromo && <span className="text-xs text-gray-500 line-through">${product.sell_price.toFixed(2)}</span>}
                    {/* Size/unit ALWAYS shows so the cashier knows how each item is priced */}
                    <span className="text-xs text-gray-400">{unitLabel(product.unit)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* ── Weight input modal ── */}
      {/* ── OPEN SHIFT MODAL ── */}
      {shiftOpenModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-6">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-700">
            <h3 className="font-bold text-lg mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>Open Shift</h3>
            <p className="text-sm text-gray-400 mb-4">Count the cash already in the drawer — that becomes your float.</p>
            <label className="text-xs uppercase tracking-wide text-gray-400 block mb-1">Location</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(['nassau','andros'] as const).map(loc => (
                <button key={loc} onClick={() => setOpenLocation(loc)}
                  className="px-3 py-2 rounded-lg text-sm font-bold"
                  style={openLocation === loc
                    ? { backgroundColor: '#f5c518', color: '#060d1f' }
                    : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
                  {loc === 'nassau' ? '🟡 Nassau' : '🟣 Andros'}
                </button>
              ))}
            </div>
            <label className="text-xs uppercase tracking-wide text-gray-400 block mb-1">Opening float (BSD)</label>
            <input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" placeholder="e.g. 200.00"
              value={openFloatDollars} onChange={e => setOpenFloatDollars(e.target.value)} autoFocus
              className="w-full bg-gray-800 text-white text-xl rounded-xl px-4 py-3 border border-gray-600 focus:outline-none focus:border-yellow-400 mb-3" />
            <label className="text-xs uppercase tracking-wide text-gray-400 block mb-1">Notes (optional)</label>
            <input type="text" placeholder="any context for this shift…"
              value={openNotes} onChange={e => setOpenNotes(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-2 border border-gray-600 focus:outline-none focus:border-yellow-400 mb-4 text-sm" />
            <div className="flex gap-3">
              <button onClick={() => setShiftOpenModal(false)} className="flex-1 bg-gray-800 text-gray-300 rounded-xl py-3 text-sm font-medium">Cancel</button>
              <button onClick={handleOpenShift} disabled={shiftBusy} className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-50" style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                {shiftBusy ? 'Opening…' : '✓ Open Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLOSE SHIFT MODAL ── */}
      {shiftCloseModal && cashierSession && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-6">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-700">
            <h3 className="font-bold text-lg mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>Close Shift</h3>
            <p className="text-sm text-gray-400 mb-3">
              Float opened: <strong className="text-white">${(cashierSession.opening_float_cents/100).toFixed(2)}</strong>
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Count the cash in the drawer NOW (including the original float). The system computes the variance against your cash sales.
            </p>
            <label className="text-xs uppercase tracking-wide text-gray-400 block mb-1">Counted cash (BSD)</label>
            <input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" placeholder="e.g. 1245.50"
              value={closeCounted} onChange={e => setCloseCounted(e.target.value)} autoFocus
              className="w-full bg-gray-800 text-white text-xl rounded-xl px-4 py-3 border border-gray-600 focus:outline-none focus:border-yellow-400 mb-3" />
            <label className="text-xs uppercase tracking-wide text-gray-400 block mb-1">Close notes (optional)</label>
            <input type="text" placeholder="missing receipts, voids, anything to flag…"
              value={closeNotes} onChange={e => setCloseNotes(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-2 border border-gray-600 focus:outline-none focus:border-yellow-400 mb-4 text-sm" />
            <div className="flex gap-3">
              <button onClick={() => setShiftCloseModal(false)} className="flex-1 bg-gray-800 text-gray-300 rounded-xl py-3 text-sm font-medium">Cancel</button>
              <button onClick={handleCloseShift} disabled={shiftBusy} className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-50" style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                {shiftBusy ? 'Closing…' : '✓ Close Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {weightInput && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-700">
            <h3 className="font-bold text-lg mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>
              Enter Weight (lbs)
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              {products.find(p => p.id === weightInput.productId)?.name}
            </p>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              placeholder="e.g. 2.45"
              value={weightInput.weight}
              onChange={e => setWeightInput(prev => prev ? { ...prev, weight: e.target.value } : null)}
              onKeyDown={e => e.key === 'Enter' && confirmWeight()}
              className="w-full bg-gray-800 text-white text-2xl rounded-xl px-4 py-3 border border-gray-600 focus:outline-none focus:border-yellow-400 text-center"
              autoFocus />
            <p className="text-xs text-gray-500 text-center mt-1">pounds — decimals supported (e.g. <strong>2.45</strong> or <strong>0.75</strong>)</p>
            {weightInput.weight && !isNaN(parseFloat(weightInput.weight)) && parseFloat(weightInput.weight) > 0 && (() => {
              const product = products.find(p => p.id === weightInput.productId)
              if (!product) return null
              const lbs   = parseFloat(weightInput.weight)
              // Use the real cart-pricing helper so the preview matches what the
              // cart will charge — including wholesale auto-upgrade at 10+ lbs.
              const snap: ProductPriceSnapshot = {
                retail_price:    product.sell_price,
                wholesale_price: product.wholesale_price,
                promo_price:     product.promo_price,
              }
              const pricing = priceCartLine(snap, lbs, 'lb')
              const total   = Math.round(pricing.unit_price * lbs * 100) / 100
              return (
                <div className="mt-3 rounded-xl p-3 text-center" style={{ backgroundColor: '#0f1f3d' }}>
                  <p className="text-xs text-gray-400">
                    {lbs.toFixed(2)} lbs × ${pricing.unit_price.toFixed(2)}/lb
                    {pricing.applied_channel === 'promo' && (
                      <span className="ml-1.5" style={{ color: '#f5c518' }}>★ Special</span>
                    )}
                    {pricing.upgraded_to_wholesale && (
                      <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: '#16a34a', color: '#fff' }}>
                        WHOLESALE
                      </span>
                    )}
                  </p>
                  <p className="text-xl font-bold mt-0.5" style={{ color: '#f5c518' }}>
                    ${total.toFixed(2)}
                  </p>
                  {pricing.qualifies_as_wholesale && !pricing.wholesale_price_available && pricing.applied_channel !== 'promo' && (
                    <p className="text-[10px] mt-1" style={{ color: '#fbbf24' }}>
                      ⚠ Qualifies for wholesale — no local_wholesale price set
                    </p>
                  )}
                </div>
              )
            })()}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setWeightInput(null)}
                className="flex-1 bg-gray-800 text-gray-300 rounded-xl py-3 text-sm font-medium">
                Cancel
              </button>
              <button onClick={confirmWeight}
                className="flex-1 rounded-xl py-3 text-sm font-bold"
                style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cart drawer ── */}
      {showCart && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCart(false)} />
          <div className="relative bg-gray-900 rounded-t-3xl border-t border-gray-700 flex flex-col" style={{ maxHeight: '95dvh' }}>
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
                    const { pricing, line_subtotal } = lineInfo(item)
                    const unitSuffix = item.product.is_per_lb ? '/lb' : ''
                    return (
                      <div key={i} className="flex items-center gap-3 bg-gray-800 rounded-xl p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{item.product.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            ${pricing.unit_price.toFixed(2)}{unitSuffix}
                            {item.product.is_per_lb && item.weight_lb
                              ? ` × ${item.weight_lb.toFixed(2)} lbs`
                              : item.quantity > 1 ? ` × ${item.quantity}` : ''}
                            {pricing.applied_channel === 'promo' && (
                              <span className="ml-1.5" style={{ color: '#f5c518' }}>★ Special</span>
                            )}
                            {pricing.upgraded_to_wholesale && (
                              <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: '#16a34a', color: '#fff' }}>
                                WHOLESALE
                              </span>
                            )}
                          </p>
                          {pricing.qualifies_as_wholesale && !pricing.wholesale_price_available && pricing.applied_channel !== 'promo' && (
                            <p className="text-[10px] mt-0.5" style={{ color: '#fbbf24' }}>
                              ⚠ Qualifies for wholesale — set local_wholesale price on /products
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!item.product.is_per_lb && (
                            <>
                              <button onClick={() => adjustQty(i, -1)} className="w-7 h-7 bg-gray-700 rounded-full text-sm font-bold flex items-center justify-center">−</button>
                              <span className="text-sm w-4 text-center">{item.quantity}</span>
                              <button onClick={() => adjustQty(i, 1)} className="w-7 h-7 bg-gray-700 rounded-full text-sm font-bold flex items-center justify-center">+</button>
                            </>
                          )}
                          <button
                            onClick={() => setEditingPriceFor({
                              id:            item.product.id,
                              sku:           item.product.sku,
                              name:          item.product.name,
                              current_price: pricing.unit_price,
                              cartIndex:     i,
                            })}
                            className="w-7 h-7 rounded-full text-xs flex items-center justify-center"
                            style={{ backgroundColor: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid #f5c518' }}
                            title="Edit selling price">
                            ✏
                          </button>
                          <span className="text-sm font-bold ml-1" style={{ color: '#f5c518' }}>${line_subtotal.toFixed(2)}</span>
                          <button onClick={() => removeFromCart(i)} className="text-red-400 text-xl ml-1 leading-none">×</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="px-5 pb-6 pt-3 border-t border-gray-800 shrink-0">
              <div className="flex justify-between text-sm text-gray-400 mb-3"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
              {/* VAT line REMOVED — disabled until BSC is approved to charge VAT. */}
              <div className="flex justify-between font-bold text-xl mb-4"><span>Total</span><span style={{ color: '#f5c518' }}>${total.toFixed(2)}</span></div>
              <button onClick={() => setShowCheckout(true)} disabled={cart.length === 0}
                className="w-full py-4 rounded-2xl font-bold text-base disabled:opacity-40"
                style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                Charge ${total.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Checkout modal ── */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-700 overflow-y-auto" style={{ maxHeight: '95dvh' }}>
            <h3 className="font-bold text-xl mb-5" style={{ fontFamily: "'Playfair Display', serif" }}>Checkout</h3>

            {/* Customer lookup */}
            <div className="mb-5 rounded-xl p-4" style={{ backgroundColor: '#0d1117', border: '1px solid #374151' }}>
              {/* Name autocomplete — type 2+ chars to surface existing customers.
                  Picking a match autofills phone/name/email + flips the panel
                  to "Returning Customer" so Claff confirms identity instantly.
                  See memory: project-customer-name-autocomplete. */}
              <CustomerNameLookup
                onPick={(c: CustomerMatch) => {
                  const phone = c.phone || c.phone_e164 || ''
                  setCustomerPhone(phone)
                  setCustomerName(c.full_name)
                  setCustomerEmail(c.email ?? '')
                  setEmailConsent(Boolean(c.email_marketing_consent))
                  setFoundCustomer({
                    id:                       c.id,
                    full_name:                c.full_name,
                    phone:                    phone,
                    email:                    c.email ?? null,
                    total_orders:             c.total_orders ?? 0,
                    total_spent:              Number(c.total_spent ?? 0),
                    email_marketing_consent:  Boolean(c.email_marketing_consent),
                  })
                  setCustomerStatus('found')
                }}
              />
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Customer Phone</label>
              <input type="tel" placeholder="e.g. 242-555-0100"
                value={customerPhone} onChange={e => handlePhoneChange(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 mb-2 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400" />

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
                  <input type="text" placeholder="Full name" value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400" />
                </>
              )}

              {(customerStatus === 'new' || customerStatus === 'found') && (
                <div className="mt-3">
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Email (optional)</label>
                  <input type="email" placeholder="customer@example.com" value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                    className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400" />
                  <label className="flex items-start gap-2 mt-2 cursor-pointer">
                    <input type="checkbox" checked={emailConsent}
                      onChange={e => setEmailConsent(e.target.checked)}
                      disabled={!customerEmail.trim()}
                      className="mt-0.5 accent-yellow-400" />
                    <span className="text-xs text-gray-300 leading-snug">
                      Opt in to BSC promotions, weekly catch reports, and special offers via email.
                    </span>
                  </label>
                </div>
              )}

              {/* Receipt channel picker. Defaults to WhatsApp (Bahamian
                  norm) — cashier can switch per sale. WhatsApp auto-
                  falls-back to SMS if WhatsApp delivery fails. Print
                  skips messaging and just shows the printable view. */}
              <div className="mt-4">
                <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wide">Receipt via</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'whatsapp', label: '💬 WhatsApp', sub: 'opens WhatsApp · tap Send' },
                    { key: 'email',    label: '✉️ Email',    sub: 'inbox' },
                    { key: 'print',    label: '🖨 Print',    sub: 'in browser' },
                  ] as const).map((opt) => {
                    const active = receiptChannel === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setReceiptChannel(opt.key)}
                        className="rounded-xl py-2 text-xs font-bold transition"
                        style={active
                          ? { backgroundColor: '#f5c518', color: '#060d1f', border: '1px solid #f5c518' }
                          : { backgroundColor: '#1f2937', color: '#9ca3af', border: '1px solid #374151' }}
                      >
                        <div>{opt.label}</div>
                        <div className="mt-0.5 text-[9px] font-medium opacity-75">{opt.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {customerStatus === 'idle' && !customerLookingUp && (
                <p className="text-xs text-gray-500">Optional — enter phone to look up or create customer</p>
              )}

              {/* Explicit save — captures the customer record now so
                  history-tracking holds even if no sale completes today. */}
              {(customerStatus === 'new' || customerStatus === 'found') && customerName.trim() && (customerPhone.trim() || customerEmail.trim()) && (
                <button
                  onClick={handleSaveCustomer}
                  disabled={savingCustomer}
                  className="w-full mt-3 rounded-xl py-2.5 text-sm font-bold disabled:opacity-50"
                  style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none' }}>
                  {savingCustomer ? 'Saving customer…' : '✓ Save customer to history'}
                </button>
              )}

              {customerSaveToast && (
                <div className="mt-2 rounded-lg p-2 text-xs font-semibold"
                  style={{
                    backgroundColor: customerSaveToast.ok ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                    color:           customerSaveToast.ok ? '#4ade80' : '#f87171',
                    border:          `1px solid ${customerSaveToast.ok ? '#16a34a' : '#f87171'}`,
                  }}>
                  {customerSaveToast.msg}
                </div>
              )}
            </div>

            {/* Payment method */}
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wide">Payment Method</label>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {PAYMENT_METHODS.map(pm => (
                <button key={pm.value} onClick={() => setPaymentMethod(pm.value)}
                  className="py-3 rounded-xl text-xs font-bold transition-colors"
                  style={paymentMethod === pm.value
                    ? { backgroundColor: '#f5c518', color: '#060d1f' }
                    : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
                  {pm.label}
                </button>
              ))}
            </div>

            {/* Card */}
            {paymentMethod === 'card' && (
              <>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Terminal</label>
                <select value={terminal} onChange={e => setTerminal(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 mb-4 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400">
                  {TERMINALS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Card Ref # <span className="text-yellow-400">(required)</span></label>
                <input type="text" placeholder="e.g. 4521" value={cardRef}
                  onChange={e => {
                    setCardRef(e.target.value)
                    // Editing the ref clears any armed dup-warning so the
                    // 8-second confirmation window doesn't carry over.
                    if (dupConfirmAt) setDupConfirmAt(null)
                  }}
                  className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 mb-2 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400 uppercase font-mono tracking-wide" />
                {/* Normalization preview — cashier sees exactly what we'll
                    save so a stray space or lowercase character doesn't
                    silently mismatch the RBC slip. */}
                {cardRef.trim() && cardRef !== normalizeCardRef(cardRef) && (
                  <p className="mb-3 text-[11px] text-amber-300">
                    Will save as <span className="font-mono font-bold">{normalizeCardRef(cardRef)}</span>
                  </p>
                )}
                {cardRef.trim() && !isValidCardRef(cardRef) && (
                  <p className="mb-3 text-[11px] text-red-300">
                    Reference must be 3–24 alphanumeric characters.
                  </p>
                )}
                {/* Last card sale this shift — fast typo check before
                    submit. Only shown when a previous card sale exists. */}
                {lastCardSale && (
                  <div className="mb-4 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-[11px] text-gray-300">
                    <span className="text-gray-500 uppercase tracking-wider">Last card sale this shift:</span>{' '}
                    <span className="font-mono font-bold text-yellow-300">{lastCardSale.card_ref}</span>
                    {' · '}
                    <span className="text-gray-400">{new Date(lastCardSale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
                {/* Dup-armed indicator — the cashier already saw the
                    "already used" alert; one more tap of Complete Sale
                    rings it through. */}
                {dupConfirmAt && (Date.now() - dupConfirmAt) < 8000 && (
                  <div className="mb-4 rounded-lg border border-amber-500 bg-amber-950 px-3 py-2 text-[12px] font-bold text-amber-200">
                    ⚠️ Tap <strong>Complete Sale</strong> again to confirm this is a NEW sale (not a re-ring).
                  </div>
                )}
              </>
            )}

            {/* Cash */}
            {paymentMethod === 'cash' && (
              <>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Cash Tendered ($)</label>
                <input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" placeholder={total.toFixed(2)}
                  value={cashTendered} onChange={e => setCashTendered(e.target.value)}
                  className="w-full bg-gray-800 text-white text-xl rounded-xl px-4 py-3 mb-3 border border-gray-700 text-center focus:outline-none focus:border-yellow-400"
                  autoFocus />
                {cashTenderedNum >= total && total > 0 && (
                  <div className="rounded-xl p-3 mb-4 text-center" style={{ backgroundColor: '#052e16' }}>
                    <p className="text-xs text-gray-400">Change Due</p>
                    <p className="text-2xl font-bold" style={{ color: '#4ade80' }}>${changeDue.toFixed(2)}</p>
                  </div>
                )}
                {cashTenderedNum > 0 && cashTenderedNum < total && (
                  <div className="rounded-xl p-3 mb-4 text-center" style={{ backgroundColor: '#3f1010', border: '1px solid #dc2626' }}>
                    <p className="text-sm font-bold" style={{ color: '#fca5a5' }}>⛔ Cash Insufficient — Sale Blocked</p>
                    <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>
                      Need ${(total - cashTenderedNum).toFixed(2)} more to complete this sale
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Wire */}
            {paymentMethod === 'wire' && (
              <>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Wire Ref # (optional)</label>
                <input type="text" placeholder="e.g. TRF-20260513" value={wireRef} onChange={e => setWireRef(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 mb-4 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400" />
              </>
            )}

            <div className="flex justify-between font-bold text-xl mb-5">
              <span>Total</span>
              <span style={{ color: '#f5c518' }}>${total.toFixed(2)}</span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowCheckout(false); resetCheckout() }} disabled={submitting}
                className="flex-1 bg-gray-800 text-gray-300 rounded-xl py-3 text-sm font-medium">
                Back
              </button>
              <button onClick={handleCheckout} disabled={submitting || !checkoutReady}
                className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-50"
                style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                {submitting ? 'Saving...' : 'Confirm Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
