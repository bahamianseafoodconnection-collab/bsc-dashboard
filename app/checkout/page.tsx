'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import CardPaymentModal, { PaymentPayload } from '@/components/CardPaymentModal';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BASE = 'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';
const BSC_MARKET_MARGIN = 25; // online market 25%
const VAT_PCT           = 10;

function fmt(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

interface CartItem {
  id:         string;
  source:     'market' | 'wholesale' | 'us';
  name:       string;
  price:      number;
  qty:        number;
  unit:       string;
  sku?:       string;
  wholesaler?: string;
  image_url?: string;
}

type View = 'summary' | 'payment' | 'done';

export default function CheckoutPage() {
  const router = useRouter();

  // In production: load cart from localStorage / context / Supabase
  // For now we pull a demo from sessionStorage key 'bsc_cart'
  const [cart, setCart]         = useState<CartItem[]>([]);
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [address, setAddress]   = useState('');
  const [island, setIsland]     = useState('Nassau');
  const [note, setNote]         = useState('');
  const [view, setView]         = useState<View>('summary');
  const [orderId, setOrderId]   = useState<string | null>(null);
  const [refNo, setRefNo]       = useState('');
  const [last4, setLast4]       = useState('');
  const [payMethod, setPayMethod] = useState<'card' | 'cod'>('card');

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('bsc_cart');
      if (stored) setCart(JSON.parse(stored));
    } catch {}
  }, []);

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  // No extra fees on market checkout — price already includes margin + VAT
  const total    = subtotal;

  const payload: PaymentPayload = {
    amount:      subtotal,
    fees:        0,
    total:       total,
    description: `BSC Market Order — ${cart.length} item${cart.length !== 1 ? 's' : ''}`,
    receiptType: 'shopping',
    orderId:     orderId || undefined,
    metadata:    {
      items:    cart.map(i => ({ id: i.id, source: i.source, sku: i.sku, name: i.name, qty: i.qty, unit: i.unit, price: i.price })),
      delivery: { name, phone, address, island, note },
    },
  };

  async function createOrder(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    const { data } = await supabase.from('orders').insert({
      order_type:           'online_market',
      payment_method:       payMethod,
      payment_status:       payMethod === 'cod' ? 'pending' : 'processing',
      wholesale_items:      cart,
      wholesale_cost_total: total,
      admin_notes:          note || null,
      user_id:              session?.user.id || null,
    }).select('id').single();
    return data?.id || '';
  }

  async function handleProceedToPayment() {
    if (!name.trim() || !phone.trim() || !address.trim()) return;
    const id = await createOrder();
    setOrderId(id);
    if (payMethod === 'cod') {
      setView('done');
    } else {
      setView('payment');
    }
  }

  async function handleCODConfirm() {
    setView('done');
  }

  const inp: React.CSSProperties = { width: '100%', padding: '11px 13px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#1a2e4a', backgroundColor: '#fff', fontFamily: 'inherit', outline: 'none' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 800 as const, color: '#475569', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 6 };

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        input:focus, select:focus, textarea:focus { border-color: #1a2e4a !important; box-shadow: 0 0 0 3px rgba(26,46,74,0.1) !important; outline: none; }
        input::placeholder, textarea::placeholder { color: #cbd5e1; }
        .bsc-btn { transition: opacity 0.15s, transform 0.15s; }
        .bsc-btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .method-btn { transition: all 0.18s; cursor: pointer; font-family: inherit; }
        .method-btn:hover { border-color: #1a2e4a !important; }
      `}</style>

      <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
        <nav style={{ backgroundColor: '#1a2e4a', padding: '0 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
          <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={`${BASE}/logo.jpg`} alt="BSC" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f5a623', cursor: 'pointer' }} onClick={() => router.push('/')} />
              <div>
                <div style={{ color: '#f5a623', fontWeight: 900, fontSize: 14, letterSpacing: 1 }}>BSC Checkout</div>
                <div style={{ color: '#94a3b8', fontSize: 10 }}>Secure Order Processing</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', padding: '5px 12px', borderRadius: 20 }}>
              <span style={{ fontSize: 12 }}>🔒</span>
              <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 600 }}>Secured by RBC</span>
            </div>
          </div>
        </nav>

        <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 60px', display: 'grid', gridTemplateColumns: cart.length > 0 ? '1fr 360px' : '1fr', gap: 24, alignItems: 'start' }}>

          {/* ── LEFT COLUMN ── */}
          <div>

            {/* ── SUMMARY VIEW ── */}
            {view === 'summary' && (
              <div style={{ animation: 'fadeUp 0.35s ease both' }}>

                {/* Delivery details */}
                <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '24px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: 17, fontWeight: 900, color: '#1a2e4a', marginBottom: 18 }}>Delivery Details</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div><label style={lbl}>Full Name *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="John Smith" style={inp} /></div>
                    <div><label style={lbl}>Phone *</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (242) 000-0000" style={inp} /></div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Delivery Address *</label>
                    <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, Subdivision, P.O. Box" style={inp} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Island</label>
                      <select value={island} onChange={e => setIsland(e.target.value)} style={{ ...inp }}>
                        {['Nassau', 'Andros', 'Exuma', 'Grand Bahama', 'Abaco', 'Eleuthera', 'Other'].map(i => <option key={i}>{i}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Order Notes</label>
                      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Special instructions…" style={inp} />
                    </div>
                  </div>
                </div>

                {/* Payment method — CARD ONLY (no wire transfer) */}
                <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: 17, fontWeight: 900, color: '#1a2e4a', marginBottom: 16 }}>Payment Method</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { key: 'card', icon: '💳', label: 'Debit / Credit Card', sub: 'Visa, Mastercard, Discover' },
                      { key: 'cod',  icon: '💵', label: 'Cash on Delivery',     sub: 'Pay when your order arrives' },
                    ].map(m => (
                      <button key={m.key} className="method-btn" onClick={() => setPayMethod(m.key as 'card' | 'cod')} style={{ padding: '14px', borderRadius: 12, border: payMethod === m.key ? '2px solid #1a2e4a' : '2px solid #e2e8f0', backgroundColor: payMethod === m.key ? '#f0f4ff' : '#fff', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, boxShadow: payMethod === m.key ? '0 0 0 3px rgba(26,46,74,0.1)' : 'none' }}>
                        <span style={{ fontSize: 24 }}>{m.icon}</span>
                        <span style={{ fontWeight: 800, fontSize: 13, color: '#1a2e4a' }}>{m.label}</span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>{m.sub}</span>
                      </button>
                    ))}
                  </div>

                  {/* No wire transfer notice */}
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 13px', marginTop: 14, fontSize: 11, color: '#64748b' }}>
                    ℹ️ BSC does not accept wire transfers for online orders. Card or COD only.
                  </div>
                </div>
              </div>
            )}

            {/* ── PAYMENT VIEW ── */}
            {view === 'payment' && (
              <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', animation: 'fadeUp 0.35s ease both' }}>
                <h2 style={{ fontSize: 17, fontWeight: 900, color: '#1a2e4a', marginBottom: 4 }}>Card Payment</h2>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Enter your debit or credit card details to complete your order.</p>
                <CardPaymentModal
                  payload={payload}
                  onApproved={(ref, l4) => { setRefNo(ref); setLast4(l4); setView('done'); }}
                  onDeclined={() => {}}
                  onCancel={() => setView('summary')}
                />
              </div>
            )}

            {/* ── DONE VIEW ── */}
            {view === 'done' && (
              <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', animation: 'fadeUp 0.4s ease both', textAlign: 'center' }}>
                <div style={{ width: 88, height: 88, borderRadius: '50%', backgroundColor: payMethod === 'card' ? '#d1fae5' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, margin: '0 auto 16px' }}>
                  {payMethod === 'card' ? '✅' : '📦'}
                </div>
                <div style={{ fontWeight: 900, fontSize: 22, color: payMethod === 'card' ? '#065f46' : '#1a2e4a', marginBottom: 6 }}>
                  {payMethod === 'card' ? 'Order Paid & Confirmed!' : 'Order Confirmed!'}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
                  {payMethod === 'card' ? `Payment of BSD $${fmt(total)} approved.` : `Pay BSD $${fmt(total)} cash when your order arrives.`}
                </div>

                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px', textAlign: 'left', marginBottom: 22 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14 }}>Order Receipt</div>
                  {[
                    refNo && { label: 'Payment Ref', value: refNo, mono: true },
                    last4 && { label: 'Card', value: `•••• •••• •••• ${last4}` },
                    { label: 'Delivery To', value: `${name} — ${address}` },
                    { label: 'Island', value: island },
                    { label: 'Items', value: `${cart.length} item${cart.length !== 1 ? 's' : ''}` },
                    { label: 'Total', value: `BSD $${fmt(total)}`, bold: true },
                    { label: 'Payment', value: payMethod === 'card' ? '💳 Card — Approved' : '💵 Cash on Delivery' },
                    { label: 'Date', value: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) },
                  ].filter(Boolean).map((row: any) => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{row.label}</span>
                      <span style={{ fontSize: 12, color: '#1a2e4a', fontWeight: row.bold ? 900 : 700, fontFamily: row.mono ? 'monospace' : 'inherit' }}>{row.value}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 12, backgroundColor: '#d1fae5', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#065f46', fontWeight: 700, textAlign: 'center' }}>
                    {payMethod === 'card' ? '✅ Saved to your history & BSC dashboard' : '📋 Order logged to BSC dashboard'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="bsc-btn" onClick={() => router.push('/market')} style={{ flex: 1, padding: '13px', borderRadius: 12, border: '2px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Continue Shopping</button>
                  <button className="bsc-btn" onClick={() => router.push('/')} style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', backgroundColor: '#1a2e4a', color: '#f5a623', fontSize: 13, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>Back to Home</button>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN — Order summary ── */}
          {cart.length > 0 && (
            <div style={{ position: 'sticky', top: 24 }}>
              <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '22px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
                <h2 style={{ fontSize: 15, fontWeight: 900, color: '#1a2e4a', marginBottom: 16 }}>Order Summary</h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, maxHeight: 320, overflowY: 'auto' }}>
                  {cart.map(item => (
                    <div key={`${item.source}-${item.id}`} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, overflow: 'hidden' }}>
                        {item.image_url ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📦'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: '#1a2e4a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                        {item.sku && <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{item.sku}</div>}
                        <div style={{ fontSize: 11, color: '#64748b' }}>Qty {item.qty} × BSD ${fmt(item.price)}</div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: '#1a2e4a', flexShrink: 0 }}>BSD ${fmt(item.price * item.qty)}</div>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: '2px solid #f1f5f9', paddingTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Subtotal ({cart.reduce((s, i) => s + i.qty, 0)} items)</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1a2e4a' }}>BSD ${fmt(subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Delivery</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>Calculated at delivery</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #1a2e4a', paddingTop: 12, marginTop: 8 }}>
                    <span style={{ fontWeight: 900, fontSize: 15, color: '#1a2e4a' }}>Total</span>
                    <span style={{ fontWeight: 900, fontSize: 20, color: '#1a2e4a' }}>BSD ${fmt(total)}</span>
                  </div>
                </div>
              </div>

              {/* CTA button */}
              {view === 'summary' && (
                <button
                  className="bsc-btn"
                  onClick={handleProceedToPayment}
                  disabled={!name.trim() || !phone.trim() || !address.trim()}
                  style={{ width: '100%', padding: '15px', borderRadius: 12, border: 'none', backgroundColor: '#1a2e4a', color: '#f5a623', fontSize: 15, fontWeight: 900, cursor: name.trim() && phone.trim() && address.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: name.trim() && phone.trim() && address.trim() ? 1 : 0.4 }}
                >
                  {payMethod === 'card' ? '💳 Proceed to Card Payment →' : '📦 Place COD Order →'}
                </button>
              )}
            </div>
          )}

          {/* Empty cart */}
          {cart.length === 0 && view === 'summary' && (
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '48px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🛒</div>
              <div style={{ fontWeight: 900, fontSize: 18, color: '#1a2e4a', marginBottom: 8 }}>Your cart is empty</div>
              <button className="bsc-btn" onClick={() => router.push('/market')} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', backgroundColor: '#1a2e4a', color: '#f5a623', fontSize: 14, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 }}>
                Browse Market
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}