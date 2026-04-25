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

  const addToCart = (product: Product) => {
    setCart(prev => {
      const ex = prev.find(c => c.id === product.id);
      return ex
        ? prev.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c)
        : [...prev, { ...product, qty: 1 }];
    });
  };

  const adjustQty = (id: string, delta: number) => {
    setCart(prev =>
      prev.map(c => c.id === id ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0)
    );
  };

  const handleCustomerSearch = (name: string) => {
    setCustomerSearch(name);
    setCustomerName(name);
    const existing = getCustomerByName(name);
    if (existing) setCustomerPhone(existing.phone);
  };

  const handleCompleteSale = async () => {
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
  };

  const handlePrint = (invoice: any) => {
    const receiptHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>BSC Receipt - ${invoice.id}</title>
  <meta charset="UTF-8">
  <style>
    /* ── UNIVERSAL RESET ── */
    * { margin: 0; padding: 0; box-sizing: border-box; }

    /* ── THERMAL PRINTER (58mm / 80mm rolls) ── */
    @media print {
      @page {
        margin: 4mm;
        size: auto; /* lets the printer decide — thermal = narrow, HP = full sheet */
      }

      html, body {
        width: 100%;
        height: auto;
      }

      .receipt {
        width: 100%;
        max-width: 100%;
        font-size: 11pt;
      }

      /* Scale up for full-size paper (HP etc) */
      @media (min-width: 148mm) {
        .receipt {
          max-width: 148mm;
          margin: 0 auto;
          font-size: 13pt;
        }
      }
    }

    /* ── SCREEN PREVIEW ── */
    body {
      font-family: 'Courier New', Courier, monospace;
      background: #fff;
      color: #000;
      display: flex;
      justify-content: center;
      padding: 10px;
    }

    .receipt {
      width: 100%;
      max-width: 380px;
      background: #fff;
      color: #000;
    }

    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }
    .sm { font-size: 0.78em; color: #444; }
    .xs { font-size: 0.68em; color: #666; }

    .logo {
      text-align: center;
      padding-bottom: 6px;
      margin-bottom: 6px;
      border-bottom: 1px dashed #000;
    }
    .logo .biz { font-size: 1.3em; font-weight: bold; letter-spacing: 1px; }
    .logo .sub { font-size: 0.72em; color: #444; margin-top: 2px; }

    .section {
      padding: 6px 0;
      border-bottom: 1px dashed #bbb;
      margin-bottom: 6px;
    }

    .invoice-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.75em;
      color: #444;
      margin-bottom: 6px;
    }

    .customer-name { font-weight: bold; font-size: 1em; }
    .customer-phone { font-size: 0.78em; color: #555; }

    /* Item rows */
    .item-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 4px 0;
      border-bottom: 1px dotted #ccc;
    }
    .item-name { font-weight: bold; font-size: 0.9em; }
    .item-meta { font-size: 0.72em; color: #666; }
    .item-total { font-weight: bold; font-size: 0.95em; white-space: nowrap; padding-left: 8px; }

    /* Totals */
    .totals { margin-top: 8px; border-top: 2px solid #000; padding-top: 6px; }
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }
    .grand-total {
      font-size: 1.4em;
      font-weight: bold;
    }
    .change-row { font-size: 0.82em; color: #333; }

    /* Footer */
    .footer {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px dashed #bbb;
      text-align: center;
      font-size: 0.7em;
      color: #666;
      line-height: 1.6;
    }

    .barcode-placeholder {
      text-align: center;
      margin: 10px 0 4px;
      font-size: 2em;
      letter-spacing: 4px;
      color: #000;
    }
  </style>
</head>
<body>
<div class="receipt">

  <!-- HEADER -->
  <div class="logo">
    <div class="biz">BSC MARKETPLACE</div>
    <div class="sub">Bahamian Seafood Connection</div>
    <div class="sub">Firetrial Road, Nassau, Bahamas</div>
    <div class="sub">bahamianseafoodconnection@gmail.com</div>
  </div>

  <!-- INVOICE META -->
  <div class="invoice-meta">
    <span><strong>Invoice:</strong> ${invoice.id}</span>
    <span>${invoice.date}</span>
  </div>

  <!-- CUSTOMER -->
  <div class="section">
    <div class="customer-name">${customerName}</div>
    <div class="customer-phone">Tel: ${customerPhone}</div>
  </div>

  <!-- ITEMS -->
  <div class="section">
    ${invoice.items.map((item: any) => `
      <div class="item-row">
        <div style="flex:1">
          <div class="item-name">${item.productName}</div>
          <div class="item-meta">${item.qty} x $${Number(item.price).toFixed(2)}</div>
        </div>
        <div class="item-total">$${Number(item.total).toFixed(2)}</div>
      </div>
    `).join('')}
  </div>

  <!-- TOTALS -->
  <div class="totals">
    <div class="total-row">
      <span class="bold" style="font-size:1.1em">TOTAL</span>
      <span class="grand-total">$${cartTotal.toFixed(2)}</span>
    </div>

    ${paymentMethod === 'cash' ? `
      <div class="total-row change-row">
        <span>Cash Given</span>
        <span>$${parseFloat(cashGiven).toFixed(2)}</span>
      </div>
      <div class="total-row change-row bold">
        <span>Change Due</span>
        <span>$${change.toFixed(2)}</span>
      </div>
    ` : `
      <div class="total-row change-row">
        <span>Payment Method</span>
        <span>Card / Terminal</span>
      </div>
    `}
  </div>

  <!-- BARCODE PLACEHOLDER -->
  <div class="barcode-placeholder">|||||||||||||||</div>
  <div class="xs center" style="margin-bottom:4px">${invoice.id}</div>

  <!-- FOOTER -->
  <div class="footer">
    <div>Thank you for shopping at BSC Marketplace!</div>
    <div>Fresh · Local · Bahamian</div>
    <div style="margin-top:4px">project-1fnu0.vercel.app/market</div>
  </div>

</div>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=500,height=700');
    if (!printWindow) return;
    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 400);
    setInvoiceSent(prev => [...prev, 'print']);
  };

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

  const qtyBtn = (bg: string, color = '#fff'): React.CSSProperties => ({
    width: 34, height: 34, borderRadius: 8, backgroundColor: bg,
    color, border: 'none', fontSize: 18, cursor: 'pointer', fontWeight: 'bold',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

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
            <div style​​​​​​​​​​​​​​​​
