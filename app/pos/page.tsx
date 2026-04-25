// File: app/pos/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  products,
  completeSale,
  saveCustomer,
  getCustomerByName,
  type Product,
} from '../../lib/store';
import { recordSaleFinancials } from '../../lib/finance';
import { createInvoice } from '../../lib/invoices';

type CartItem = Product & { qty: number };
type PaymentMethod = 'cash' | 'card' | null;
type Screen = 'shop' | 'cart' | 'payment' | 'complete';

export default function POSPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('shop');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [cashGiven, setCashGiven] = useState('');
  const [processing, setProcessing] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<any>(null);
  const [invoiceSent, setInvoiceSent] = useState<string[]>([]);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const change = parseFloat(cashGiven) - cartTotal;

  const filtered = products
    .filter(p => p.stock > p.minStock)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  function addToCart(product: Product) {
    setCart(prev => {
      const ex = prev.find(c => c.id === product.id);
      return ex
        ? prev.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c)
        : [...prev, { ...product, qty: 1 }];
    });
  }

  function adjustQty(id: string, delta: number) {
    setCart(prev =>
      prev.map(c => c.id === id ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0)
    );
  }

  function handleCustomerSearch(name: string) {
    setCustomerSearch(name);
    setCustomerName(name);
    const existing = getCustomerByName(name);
    if (existing) setCustomerPhone(existing.phone);
  }

  async function handleCompleteSale() {
    if (!customerName || !customerPhone || cart.length === 0 || !paymentMethod) return;
    setProcessing(true);
    const sale = {
      customerName,
      customerPhone,
      items: cart.map(item => ({
        productId: item.id,
        productName: item.name,
        price: item.price,
        qty: item.qty,
        supplierName: item.supplierName,
      })),
      total: cartTotal,
    };
    const result = completeSale(sale);
    if (!result.success) { setProcessing(false); return; }
    saveCustomer({ name: customerName, phone: customerPhone });
    await recordSaleFinancials(cartTotal);
    const invoice = await createInvoice(sale);
    setCompletedInvoice(invoice);
    setProcessing(false);
    setScreen('complete');
  }

  const inp: React.CSSProperties = {
    display: 'block', width: '100%', padding: '11px 13px',
    borderRadius: 10, backgroundColor: '#111c33', color: '#fff',
    border: '1px solid #1e2d4a', fontSize: 14, marginBottom: 12,
    boxSizing: 'border-box' as const, outline: 'none',
  };

  const pg: React.CSSProperties = {
    padding: 16, backgroundColor: '#060d1f', minHeight: '100vh',
    color: '#fff', fontFamily: 'sans-serif', paddingBottom: 90,
    maxWidth: 560, margin: '0 auto',
  };

  const card: React.CSSProperties = {
    backgroundColor: '#0d1f3c', borderRadius: 14, padding: '14px 16px',
    border: '1px solid #1e3a5f', marginBottom: 12,
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

  function qtyBtn(bg: string, color = '#fff'): React.CSSProperties {
    return {
      width: 34, height: 34, borderRadius: 8, backgroundColor: bg,
      color, border: 'none', fontSize: 18, cursor: 'pointer', fontWeight: 'bold',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    };
  }

  // ── SHOP ──
  if (screen === 'shop') return (
    <div style={pg}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, color: '#f5c518', fontSize: 20, fontWeight: 'bold' }}>🛒 Walking POS</h1>
          <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>BSC Marketplace · Firetrial Rd</p>
        </div>
        {cartCount > 0 && (
          <button onClick={() => setScreen('cart')} style={{
            backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold',
            border: 'none', borderRadius: 12, padding: '10px 18px', fontSize: 14, cursor: 'pointer',
          }}>
            Cart ({cartCount}) · ${cartTotal.toFixed(2)}
          </button>
        )}
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>CUSTOMER</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Customer name..."
            value={customerSearch}
            onChange={(e) => handleCustomerSearch(e.target.value)}
            style={{ ...inp, flex: 1, marginBottom: 0 }}
          />
          {customerPhone && (
            <div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 10, padding: '0 12px', display: 'flex', alignItems: 'center' }}>
              <p style={{ margin: 0, color: '#4ade80', fontSize: 12, whiteSpace: 'nowrap' as const }}>{customerPhone}</p>
            </div>
          )}
        </div>
        {!customerPhone && customerName && (
          <input
            placeholder="Phone / WhatsApp..."
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            style={{ ...inp, marginTop: 8, marginBottom: 0 }}
          />
        )}
      </div>

      <input
        placeholder="🔍 Search products..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ ...inp, marginBottom: 14 }}
      />

      {filtered.length === 0 && (
        <p style={{ color: '#4a5568', textAlign: 'center', padding: 30 }}>No products found</p>
      )}
      {filtered.map(product => {
        const inCart = cart.find(c => c.id === product.id);
        return (
          <div key={product.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{product.name}</p>
                <p style={{ margin: '4px 0 2px', color: '#4ade80', fontSize: 18, fontWeight: 'bold' }}>${product.price.toFixed(2)}</p>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{product.stock - product.minStock} available</p>
              </div>
              {inCart ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => adjustQty(product.id, -1)} style={qtyBtn('#1e3a5f')}>−</button>
                  <span style={{ fontWeight: 'bold', fontSize: 16, minWidth: 20, textAlign: 'center' as const }}>{inCart.qty}</span>
                  <button onClick={() => adjustQty(product.id, 1)} style={qtyBtn('#f5c518', '#000')}>+</button>
                </div>
              ) : (
                <button onClick={() => addToCart(product)} style={{
                  padding: '10px 18px', borderRadius: 10, backgroundColor: '#f5c518',
                  color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 14,
                }}>
                  Add
                </button>
              )}
            </div>
          </div>
        );
      })}

      {cartCount > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px', backgroundColor: '#070e1d', borderTop: '1px solid #1e3a5f', zIndex: 100 }}>
          <button onClick={() => setScreen('cart')} style={primaryBtn}>
            View Cart ({cartCount} items) · ${cartTotal.toFixed(2)} →
          </button>
        </div>
      )}
    </div>
  );

  // ── CART ──
  if (screen === 'cart') return (
    <div style={pg}>
      <button onClick={() => setScreen('shop')} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 14, cursor: 'pointer', marginBottom: 14, padding: 0 }}>
        ← Back to Products
      </button>
      <h2 style={{ margin: '0 0 16px', color: '#f5c518', fontSize: 20 }}>🛒 Cart Review</h2>

      <div style={{ ...card, borderColor: customerName && customerPhone ? '#4ade80' : '#f5c518' }}>
        <p style={{ margin: '0 0 10px', color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>CUSTOMER</p>
        {!customerName || !customerPhone ? (
          <>
            <input placeholder="Customer Name *" value={customerName} onChange={(e) => handleCustomerSearch(e.target.value)} style={inp} />
            <input placeholder="Phone / WhatsApp *" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} style={{ ...inp, marginBottom: 0 }} />
          </>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>{customerName}</p>
              <p style={{ margin: '2px 0 0', color: '#4ade80', fontSize: 13 }}>📱 {customerPhone}</p>
            </div>
            <button onClick={() => { setCustomerName(''); setCustomerPhone(''); setCustomerSearch(''); }}
              style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>
              Change
            </button>
          </div>
        )}
      </div>

      {cart.map(item => (
        <div key={item.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{item.name}</p>
              <p style={{ margin: '3px 0 0', color: '#aaa', fontSize: 13 }}>
                {item.qty} × ${item.price.toFixed(2)} = <span style={{ color: '#4ade80', fontWeight: 'bold' }}>${(item.qty * item.price).toFixed(2)}</span>
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => adjustQty(item.id, -1)} style={qtyBtn('#1e3a5f')}>−</button>
              <span style={{ fontWeight: 'bold', fontSize: 15, minWidth: 20, textAlign: 'center' as const }}>{item.qty}</span>
              <button onClick={() => adjustQty(item.id, 1)} style={qtyBtn('#f5c518', '#000')}>+</button>
            </div>
          </div>
        </div>
      ))}

      <div style={{ ...card, backgroundColor: '#0a1f0a', borderColor: '#4ade80', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ margin: 0, color: '#4ade80', fontSize: 16, fontWeight: 'bold' }}>Total</p>
        <p style={{ margin: 0, color: '#4ade80', fontSize: 24, fontWeight: 'bold' }}>${cartTotal.toFixed(2)}</p>
      </div>

      <button onClick={() => { if (!customerName || !customerPhone) { alert('Please enter customer name and phone'); return; } setScreen('payment'); }} style={primaryBtn}>
        Proceed to Payment →
      </button>
      <button onClick={() => setScreen('shop')} style={secondaryBtn}>← Add More Items</button>
    </div>
  );

  // ── PAYMENT ──
  if (screen === 'payment') return (
    <div style={pg}>
      <button onClick={() => setScreen('cart')} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 14, cursor: 'pointer', marginBottom: 14, padding: 0 }}>
        ← Back to Cart
      </button>
      <h2 style={{ margin: '0 0 6px', color: '#f5c518', fontSize: 20 }}>💳 Payment</h2>
      <p style={{ margin: '0 0 20px', color: '#4a5568', fontSize: 13 }}>{customerName} · {customerPhone}</p>

      <div style={{ ...card, backgroundColor: '#0a1f0a', borderColor: '#4ade80', textAlign: 'center', padding: '20px', marginBottom: 20 }}>
        <p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 12, letterSpacing: 1 }}>AMOUNT DUE</p>
        <p style={{ margin: 0, color: '#4ade80', fontSize: 36, fontWeight: 'bold' }}>${cartTotal.toFixed(2)}</p>
      </div>

      <p style={{ color: '#6b7280', fontSize: 11, letterSpacing: 1, marginBottom: 10 }}>SELECT PAYMENT METHOD</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[
          { method: 'cash' as PaymentMethod, icon: '💵', label: 'Cash' },
          { method: 'card' as PaymentMethod, icon: '💳', label: 'Card' },
        ].map(opt => (
          <button key={opt.method} onClick={() => setPaymentMethod(opt.method)} style={{
            padding: '20px 16px', borderRadius: 14,
            backgroundColor: paymentMethod === opt.method ? '#f5c518' : '#0d1f3c',
            color: paymentMethod === opt.method ? '#000' : '#aaa',
            border: paymentMethod === opt.method ? 'none' : '1px solid #1e3a5f',
            fontWeight: 'bold', fontSize: 16, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 28 }}>{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>

      {paymentMethod === 'cash' && (
        <div style={card}>
          <p style={{ margin: '0 0 10px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>Cash Given</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' as const }}>
            {[
              cartTotal,
              Math.ceil(cartTotal / 5) * 5,
              Math.ceil(cartTotal / 10) * 10,
              Math.ceil(cartTotal / 20) * 20,
              50, 100
            ].filter((v, i, a) => a.indexOf(v) === i && v >= cartTotal).slice(0, 5).map(amt => (
              <button key={amt} onClick={() => setCashGiven(amt.toFixed(2))} style={{
                padding: '8px 14px', borderRadius: 8,
                backgroundColor: parseFloat(cashGiven) === amt ? '#f5c518' : '#1e3a5f',
                color: parseFloat(cashGiven) === amt ? '#000' : '#fff',
                border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 13,
              }}>
                ${amt.toFixed(0)}
              </button>
            ))}
          </div>
          <input type="number" placeholder="Enter cash amount..." value={cashGiven}
            onChange={(e) => setCashGiven(e.target.value)}
            style={{ ...inp, fontSize: 20, fontWeight: 'bold', marginBottom: 0 }}
          />
          {parseFloat(cashGiven) >= cartTotal && (
            <div style={{ marginTop: 12, backgroundColor: '#0a1f0a', borderRadius: 10, padding: '12px 14px', border: '1px solid #4ade80' }}>
              <p style={{ margin: 0, color: '#4a5568', fontSize: 12 }}>Change Due</p>
              <p style={{ margin: '4px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 22 }}>${change.toFixed(2)}</p>
            </div>
          )}
          {parseFloat(cashGiven) > 0 && parseFloat(cashGiven) < cartTotal && (
            <div style={{ marginTop: 12, backgroundColor: '#2d0000', borderRadius: 10, padding: '12px 14px', border: '1px solid #f87171' }}>
              <p style={{ margin: 0, color: '#f87171', fontSize: 13 }}>⚠️ Short by ${(cartTotal - parseFloat(cashGiven)).toFixed(2)}</p>
            </div>
          )}
        </div>
      )}

      {paymentMethod === 'card' && (
        <div style={{ ...card, textAlign: 'center', padding: 20 }}>
          <p style={{ margin: '0 0 8px', fontSize: 32 }}>💳</p>
          <p style={{ margin: 0, color: '#aaa', fontSize: 14 }}>Process card payment on terminal</p>
          <p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 12 }}>Tap Complete Sale when confirmed</p>
        </div>
      )}

      <button
        onClick={handleCompleteSale}
        disabled={
          processing || !paymentMethod ||
          (paymentMethod === 'cash' && parseFloat(cashGiven) < cartTotal)
        }
        style={{
          ...primaryBtn, marginTop: 16,
          backgroundColor: processing ? '#555' :
            (!paymentMethod || (paymentMethod === 'cash' && parseFloat(cashGiven) < cartTotal)) ? '#2a2a2a' : '#f5c518',
          color: (!paymentMethod || (paymentMethod === 'cash' && parseFloat(cashGiven) < cartTotal)) ? '#555' : '#000',
          cursor: processing || !paymentMethod ? 'not-allowed' : 'pointer',
        }}
      >
        {processing ? '⏳ Processing...' : '✅ Complete Sale'}
      </button>
    </div>
  );

  // ── COMPLETE ──
  if (screen === 'complete' && completedInvoice) {
    const receiptHTML = `
      <html>
      <head>
        <title>BSC Receipt</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            font-size: 13px;
            color: #000;
            background: #fff;
            width: 80mm;
            padding: 8mm;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .large { font-size: 16px; }
          .xlarge { font-size: 20px; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
          .muted { color: #555; font-size: 11px; }
          .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 16px; padding-top: 6px; }
          .footer { text-align: center; margin-top: 12px; font-size: 11px; color: #555; }
        </style>
      </head>
      <body>
        <div class="center bold large">BSC MARKETPLACE</div>
        <div class="center muted">Bahamian Seafood Connection</div>
        <div class="center muted">Firetrial Road, Nassau, Bahamas</div>
        <div class="center muted">bahamianseafoodconnection@gmail.com</div>
        <div class="divider"></div>
        <div class="center bold">${completedInvoice.id}</div>
        <div class="center muted">${completedInvoice.date}</div>
        <div class="divider"></div>
        <div class="bold">${customerName}</div>
        <div class="muted">📱 ${customerPhone}</div>
        <div class="divider"></div>
        ${completedInvoice.items.map((item: any) => `
          <div class="row">
            <div>
              <div class="bold">${item.productName}</div>
              <div class="muted">${item.qty} x $${item.price.toFixed(2)}</div>
            </div>
            <div class="bold">$${item.total.toFixed(2)}</div>
          </div>
        `).join('')}
        <div class="divider"></div>
        <div class="total-row">
          <span>TOTAL</span>
          <span>$${cartTotal.toFixed(2)}</span>
        </div>
        ${paymentMethod === 'cash' ? `
          <div class="row muted" style="margin-top:6px">
            <span>Cash Given</span><span>$${parseFloat(cashGiven).toFixed(2)}</span>
          </div>
          <div class="row bold">
            <span>Change</span><span>$${change.toFixed(2)}</span>
          </div>
        ` : `
          <div class="row muted" style="margin-top:6px">
            <span>Payment</span><span>Card</span>
          </div>
        `}
        <div class="footer">
          <div>Thank you for shopping at BSC Marketplace!</div>
          <div>Come back soon 🐟</div>
        </div>
      </body>
      </html>
    `;

    function handlePrint() {
      const printWindow = window.open('', '_blank', 'width=400,height=600');
      if (!printWindow) return;
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 300);
      setInvoiceSent(prev => [...prev, 'print']);
    }

    return (
      <div style={pg}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 56, marginBottom: 10 }}>✅</div>
          <h2 style={{ margin: '0 0 4px', color: '#4ade80', fontSize: 22 }}>Sale Complete!</h2>
          <p style={{ margin: 0, color: '#4a5568', fontSize: 13 }}>{completedInvoice.id}</p>
        </div>

        {/* ON-SCREEN RECEIPT */}
        <div style={{ backgroundColor: '#fff', color: '#111', borderRadius: 14, padding: '20px', marginBottom: 20, fontFamily: 'monospace' }}>
          <div style={{ textAlign: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px dashed #ccc' }}>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>BSC MARKETPLACE</p>
            <p style={{ margin: '2px 0', fontSize: 11, color: '#666' }}>Bahamian Seafood Connection</p>
            <p style={{ margin: '2px 0', fontSize: 11, color: '#666' }}>Firetrial Road, Nassau, Bahamas</p>
            <p style={{ margin: '2px 0', fontSize: 10, color: '#999' }}>{completedInvoice.date}</p>
            <p style={{ margin: '2px 0', fontSize: 10, color: '#aaa' }}>{completedInvoice.id}</p>
          </div>
          <p style={{ margin: '0 0 2px', fontWeight: 'bold', fontSize: 14 }}>{customerName}</p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#555' }}>📱 {customerPhone}</p>
          {completedInvoice.items.map((item: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottom: '1px dotted #ddd' }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>{item.productName}</p>
                <p style={{ margin: 0, fontSize: 11, color: '#888' }}>{item.qty} × ${item.price.toFixed(2)}</p>
              </div>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>${item.total.toFixed(2)}</p>
            </div>
          ))}
          <div style={{ borderTop: '2px solid #111', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>TOTAL</p>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: 18 }}>${cartTotal.toFixed(2)}</p>
          </div>
          {paymentMethod === 'cash' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <p style={{ margin: 0, color: '#555', fontSize: 12 }}>Cash Given</p>
                <p style={{ margin: 0, fontSize: 12 }}>${parseFloat(cashGiven).toFixed(2)}</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <p style={{ margin: 0, color: '#555', fontSize: 12 }}>Change</p>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 'bold', color: '#000' }}>${change.toFixed(2)}</p>
              </div>
            </>
          )}
          <p style={{ margin: '14px 0 0', color: '#999', fontSize: 10, textAlign: 'center' as const }}>Thank you for shopping at BSC Marketplace 🐟</p>
        </div>

        {/* DELIVERY BUTTONS */}
        <p style={{ color: '#6b7280', fontSize: 11, letterSpacing: 1, margin: '0 0 10px' }}>SEND INVOICE TO CUSTOMER</p>

        <button onClick={handlePrint} style={{
          ...primaryBtn,
          backgroundColor: invoiceSent.includes('print') ? '#0a1f0a' : '#f5c518',
          color: invoiceSent.includes('print') ? '#4ade80' : '#000',
          border: invoiceSent.includes('print') ? '1px solid #4ade80' : 'none',
        }}>
          {invoiceSent.includes('print') ? '✅ Printed' : '🖨️ Print Receipt'}
        </button>

        <button onClick={() => {
          const msg = encodeURIComponent(
            `*BSC MARKETPLACE*\nFiretrial Road, Nassau\n\n*Invoice: ${completedInvoice.id}*\nDate: ${completedInvoice.date}\n\nCustomer: ${customerName}\n\n*Items:*\n${completedInvoice.items.map((i: any) => `${i.productName} x${i.qty} = $${i.total.toFixed(2)}`).join('\n')}\n\n*TOTAL: $${cartTotal.toFixed(2)}*\n\nThank you for shopping at BSC Marketplace!`
          );
          const phone = customerPhone.replace(/\D/g, '');
          window.open(`https://wa.me/${phone.startsWith('1') ? phone : '1242' + phone}?text=${msg}`, '_blank');
          setInvoiceSent(prev => [...prev, 'whatsapp']);
        }} style={{
          ...primaryBtn,
          backgroundColor: invoiceSent.includes('whatsapp') ? '#0a2010' : '#25d366',
          color: invoiceSent.includes('whatsapp') ? '#4ade80' : '#fff',
          border: invoiceSent.includes('whatsapp') ? '1px solid #4ade80' : 'none',
        }}>
          {invoiceSent.includes('whatsapp') ? '✅ Sent via WhatsApp' : '💬 Send via WhatsApp'}
        </button>

        <button onClick={() => {
          const subject = encodeURIComponent(`BSC Marketplace Invoice ${completedInvoice.id}`);
          const body = encodeURIComponent(
            `BSC MARKETPLACE\nFiretrial Road, Nassau, Bahamas\n\nInvoice: ${completedInvoice.id}\nDate: ${completedInvoice.date}\nCustomer: ${customerName}\n\nItems:\n${completedInvoice.items.map((i: any) => `${i.productName} x${i.qty} = $${i.total.toFixed(2)}`).join('\n')}\n\nTOTAL: $${cartTotal.toFixed(2)}\n\nThank you!\nbahamianseafoodconnection@gmail.com`
          );
          window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
          setInvoiceSent(prev => [...prev, 'email']);
        }} style={{
          ...primaryBtn,
          backgroundColor: invoiceSent.includes('email') ? '#001a2a' : '#60a5fa',
          color: invoiceSent.includes('email') ? '#60a5fa' : '#000',
          border: invoiceSent.includes('email') ? '1px solid #60a5fa' : 'none',
        }}>
          {invoiceSent.includes('email') ? '✅ Email Opened' : '📧 Send via Email'}
        </button>

        <button onClick={() => router.push('/invoice?id=' + encodeURIComponent(completedInvoice.id))}
          style={{ ...primaryBtn, backgroundColor: 'transparent', color: '#f5c518', border: '1px solid #f5c518' }}>
          📄 View Full Invoice
        </button>

        <button onClick={() => {
          setCart([]); setCustomerName(''); setCustomerPhone('');
          setCustomerSearch(''); setPaymentMethod(null); setCashGiven('');
          setCompletedInvoice(null); setInvoiceSent([]); setScreen('shop');
        }} style={secondaryBtn}>
          ＋ New Sale
        </button>
      </div>
    );
  }

  return null;
}
