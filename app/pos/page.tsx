// File: app/pos/page.tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import {
  products, completeSale, saveCustomer, searchCustomers,
  type Product, type Customer,
} from '../../lib/store';
import { recordSaleFinancials } from '../../lib/finance';
import { createInvoice } from '../../lib/invoices';

const supabase = createClient(
  'https://auqjjrisivhfmpleusyt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg'
);

type CartItem = Product & { qty: number };
type PaymentMethod = 'cash' | 'card' | null;
type Screen = 'shop' | 'cart' | 'payment' | 'complete';
type RouterType = { push: (path: string) => void };

const BSC_WHATSAPP = '12423613474';
const BSC_WHATSAPP_DISPLAY = '+1 (242) 361-3474';

const pg: React.CSSProperties = {
  padding: 16, backgroundColor: '#060d1f', minHeight: '100vh',
  color: '#fff', fontFamily: 'sans-serif', paddingBottom: 90,
  maxWidth: 560, margin: '0 auto', width: '100%',
};
const card: React.CSSProperties = {
  backgroundColor: '#0d1f3c', borderRadius: 14, padding: '14px 16px',
  border: '1px solid #1e3a5f', marginBottom: 12,
};
const inp: React.CSSProperties = {
  display: 'block', width: '100%', padding: '12px 13px',
  borderRadius: 10, backgroundColor: '#111c33', color: '#fff',
  border: '1px solid #1e2d4a', fontSize: 16, marginBottom: 10,
  boxSizing: 'border-box' as const, outline: 'none',
  WebkitAppearance: 'none' as const,
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
const qtyBtnStyle = (bg: string, color = '#fff'): React.CSSProperties => ({
  width: 36, height: 36, borderRadius: 8, backgroundColor: bg,
  color, border: 'none', fontSize: 20, cursor: 'pointer', fontWeight: 'bold',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
});

function BSCControlBack({ router }: { router: RouterType }) {
  return (
    <button
      onClick={() => router.push('/')}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'linear-gradient(135deg, #1a1200, #2a1e00)',
        border: '1px solid #f5c518', borderRadius: 10,
        color: '#f5c518', fontWeight: 'bold', fontSize: 12,
        cursor: 'pointer', padding: '7px 14px', marginBottom: 14,
      }}
    >
      ← BSC Control
    </button>
  );
}

function WhatsAppPanel({ side }: { side: 'top' | 'right' }) {
  const [waTab, setWaTab] = useState<'web' | 'qr'>('web');
  const isRight = side === 'right';
  return (
    <div style={{ backgroundColor: '#070e1d', border: '1px solid #25d366', borderRadius: isRight ? 16 : 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: isRight ? '100vh' : 'auto', position: isRight ? 'sticky' : 'relative', top: isRight ? 0 : undefined }}>
      <div style={{ backgroundColor: '#075e54', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>💬</span>
          <div>
            <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 14 }}>BSC WhatsApp</p>
            <p style={{ margin: 0, color: '#25d36699', fontSize: 11 }}>{BSC_WHATSAPP_DISPLAY}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setWaTab('web')} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: waTab === 'web' ? '#25d366' : 'rgba(255,255,255,0.1)', color: waTab === 'web' ? '#000' : '#fff', fontWeight: 'bold', fontSize: 11 }}>Web</button>
          <button onClick={() => setWaTab('qr')} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: waTab === 'qr' ? '#25d366' : 'rgba(255,255,255,0.1)', color: waTab === 'qr' ? '#000' : '#fff', fontWeight: 'bold', fontSize: 11 }}>QR</button>
        </div>
      </div>
      {waTab === 'web' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: isRight ? 0 : 400 }}>
          <iframe src="https://web.whatsapp.com" style={{ flex: 1, border: 'none', width: '100%', minHeight: isRight ? 0 : 400, backgroundColor: '#fff' }} allow="camera; microphone" title="WhatsApp Web" />
        </div>
      )}
      {waTab === 'qr' && (
        <div style={{ padding: 20, textAlign: 'center', flex: 1 }}>
          <p style={{ margin: '0 0 16px', color: '#aaa', fontSize: 13 }}>Scan to open BSC WhatsApp on your phone</p>
          <img src={`https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=https%3A%2F%2Fapi.whatsapp.com%2Fsend%3Fphone%3D${BSC_WHATSAPP}&choe=UTF-8`} alt="BSC WhatsApp QR" style={{ width: 200, height: 200, borderRadius: 12, backgroundColor: '#fff', padding: 8 }} />
          <p style={{ margin: '16px 0 8px', color: '#25d366', fontWeight: 'bold', fontSize: 14 }}>{BSC_WHATSAPP_DISPLAY}</p>
          <p style={{ margin: '0 0 16px', color: '#4a5568', fontSize: 12 }}>Customers scan to WhatsApp BSC directly</p>
          <a href={`https://api.whatsapp.com/send?phone=${BSC_WHATSAPP}`} target="_blank" rel="noopener noreferrer" style={{ display: 'block', backgroundColor: '#25d366', color: '#000', fontWeight: 'bold', fontSize: 14, padding: '12px', borderRadius: 12, textDecoration: 'none', marginBottom: 10 }}>💬 Open WhatsApp Chat</a>
          <a href="https://web.whatsapp.com" target="_blank" rel="noopener noreferrer" style={{ display: 'block', backgroundColor: '#075e54', color: '#fff', fontWeight: 'bold', fontSize: 14, padding: '12px', borderRadius: 12, textDecoration: 'none' }}>🖥️ Open WhatsApp Web</a>
        </div>
      )}
    </div>
  );
}

function CustomerDropdown({ suggestions, onSelect }: { suggestions: Customer[]; onSelect: (c: Customer) => void }) {
  if (suggestions.length === 0) return null;
  return (
    <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #f5c518', borderRadius: 10, overflow: 'hidden', marginTop: -8, marginBottom: 10 }}>
      {suggestions.map(c => (
        <button key={c.id} onClick={() => onSelect(c)} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid #1e3a5f', cursor: 'pointer', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{c.name}</p>
              <p style={{ margin: '2px 0 0', color: '#60a5fa', fontSize: 12 }}>📱 {c.phone}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{c.visitCount} visits</p>
              <p style={{ margin: '2px 0 0', color: '#f5c518', fontSize: 11 }}>${(c.totalSpent || 0).toFixed(2)} spent</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function CustomerInputBlock({
  customerQuery, customerName, customerPhone, suggestions,
  onQueryChange, onSelect, onClear, onNameChange, onPhoneChange,
}: {
  customerQuery: string;
  customerName: string;
  customerPhone: string;
  suggestions: Customer[];
  onQueryChange: (val: string) => void;
  onSelect: (c: Customer) => void;
  onClear: () => void;
  onNameChange: (val: string) => void;
  onPhoneChange: (val: string) => void;
}) {
  return (
    <div style={card}>
      <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>CUSTOMER — search by name or phone</p>
      <input
        placeholder="Type name or phone number..."
        value={customerQuery}
        onChange={(e) => onQueryChange(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        style={{ ...inp, marginBottom: suggestions.length > 0 ? 2 : 8 }}
      />
      <CustomerDropdown suggestions={suggestions} onSelect={onSelect} />
      {customerName && customerPhone ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0a1f0a', borderRadius: 10, padding: '10px 12px', border: '1px solid #4ade80' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{customerName}</p>
            <p style={{ margin: '2px 0 0', color: '#4ade80', fontSize: 13 }}>📱 {customerPhone}</p>
          </div>
          <button onClick={onClear} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>Change</button>
        </div>
      ) : (
        <>
          {customerName && !customerPhone && (
            <input
              placeholder="Phone / WhatsApp *"
              value={customerPhone}
              onChange={(e) => onPhoneChange(e.target.value)}
              type="tel"
              autoComplete="off"
              style={{ ...inp, marginBottom: 0 }}
            />
          )}
          {customerPhone && !customerName && (
            <input
              placeholder="Customer name *"
              value={customerName}
              onChange={(e) => onNameChange(e.target.value)}
              autoComplete="off"
              style={{ ...inp, marginBottom: 0 }}
            />
          )}
        </>
      )}
    </div>
  );
}

function POSLayout({ children, showWaPanel, setShowWaPanel }: {
  children: React.ReactNode;
  showWaPanel: boolean;
  setShowWaPanel: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#060d1f' }}>
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', paddingBottom: 80 }}>{children}</div>
      <div className="wa-panel-desktop" style={{ width: 380, flexShrink: 0, backgroundColor: '#070e1d', borderLeft: '1px solid #25d36633', display: 'none' }}>
        <WhatsAppPanel side="right" />
      </div>
      <button onClick={() => setShowWaPanel(!showWaPanel)} className="wa-toggle-mobile" style={{ position: 'fixed', bottom: 80, right: 16, width: 52, height: 52, borderRadius: '50%', backgroundColor: '#25d366', color: '#000', border: 'none', fontSize: 26, cursor: 'pointer', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(37,211,102,0.4)' }}>
        💬
      </button>
      {showWaPanel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column' }}>
          <div onClick={() => setShowWaPanel(false)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)' }} />
          <div style={{ position: 'relative', zIndex: 1, margin: 'auto 0 0', height: '80vh', backgroundColor: '#070e1d', borderRadius: '20px 20px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #1e3a5f' }}>
              <p style={{ margin: 0, color: '#25d366', fontWeight: 'bold', fontSize: 15 }}>💬 BSC WhatsApp</p>
              <button onClick={() => setShowWaPanel(false)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}><WhatsAppPanel side="top" /></div>
          </div>
        </div>
      )}
      <style>{`
        @media (min-width: 900px) { .wa-panel-desktop { display: block !important; } .wa-toggle-mobile { display: none !important; } }
        @media (max-width: 899px) { .wa-panel-desktop { display: none !important; } }
      `}</style>
    </div>
  );
}

export default function POSPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('shop');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [cashGiven, setCashGiven] = useState('');
  const [processing, setProcessing] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<any>(null);
  const [invoiceSent, setInvoiceSent] = useState<string[]>([]);
  const [showWaPanel, setShowWaPanel] = useState(false);
  const [isControlAdmin, setIsControlAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      if (!user) return;
      supabase.from('profiles').select('role').eq('id', user.id).single().then(({ data }) => {
        if (data?.role === 'control_admin') setIsControlAdmin(true);
      });
    });
  }, []);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cashNum = parseFloat(cashGiven) || 0;
  const change = cashNum - cartTotal;

  const filtered = products
    .filter(p => p.stock > p.minStock)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const addToCart = useCallback((product: Product) => {
    setCart(prev => {
      const ex = prev.find(c => c.id === product.id);
      return ex ? prev.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c) : [...prev, { ...product, qty: 1 }];
    });
  }, []);

  const adjustQty = useCallback((id: string, delta: number) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0));
  }, []);

  const handleCustomerQuery = useCallback((val: string) => {
    setCustomerQuery(val);
    const isPhone = /^[\d\s\-\+\(\)]+$/.test(val) && val.replace(/\D/g, '').length >= 3;
    if (isPhone) setCustomerPhone(val);
    else setCustomerName(val);
    setSuggestions(searchCustomers(val));
  }, []);

  const selectCustomer = useCallback((c: Customer) => {
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setCustomerQuery(c.name);
    setSuggestions([]);
  }, []);

  const clearCustomer = useCallback(() => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerQuery('');
    setSuggestions([]);
  }, []);

  const handleCompleteSale = async () => {
    if (!customerName || !customerPhone || cart.length === 0 || !paymentMethod) return;
    setProcessing(true);
    const sale = {
      customerName, customerPhone,
      items: cart.map(item => ({
        productId: item.id, productName: item.name,
        price: item.price, qty: item.qty, supplierName: item.supplierName,
      })),
      total: cartTotal,
    };
    const result = completeSale(sale);
    if (!result.success) { setProcessing(false); return; }
    saveCustomer({ name: customerName, phone: customerPhone, amountSpent: cartTotal });
    await recordSaleFinancials(cartTotal);
    const invoice = await createInvoice(sale);
    setCompletedInvoice(invoice);
    setProcessing(false);
    setScreen('complete');
  };

  const handlePrint = useCallback((invoice: any) => {
    const receiptHTML = `<!DOCTYPE html>
<html><head><title>BSC Receipt</title><meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  @media print{@page{margin:4mm;size:auto}html,body{width:100%}}
  body{font-family:'Courier New',monospace;background:#fff;color:#000;display:flex;justify-content:center;padding:10px}
  .receipt{width:100%;max-width:380px}
  .logo{text-align:center;padding-bottom:8px;margin-bottom:8px;border-bottom:1px dashed #000}
  .biz{font-size:1.3em;font-weight:bold;letter-spacing:1px}
  .sub{font-size:0.72em;color:#444;margin-top:2px}
  .meta{display:flex;justify-content:space-between;font-size:0.75em;color:#444;margin-bottom:8px}
  .section{padding:6px 0;border-bottom:1px dashed #bbb;margin-bottom:8px}
  .item-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #ccc}
  .item-name{font-weight:bold;font-size:0.9em}
  .item-meta{font-size:0.72em;color:#666}
  .item-total{font-weight:bold;font-size:0.95em;padding-left:8px;white-space:nowrap}
  .totals{margin-top:8px;border-top:2px solid #000;padding-top:8px}
  .total-row{display:flex;justify-content:space-between;margin-bottom:4px}
  .grand{font-size:1.4em;font-weight:bold}
  .sm{font-size:0.8em;color:#333}
  .footer{margin-top:14px;padding-top:8px;border-top:1px dashed #bbb;text-align:center;font-size:0.7em;color:#666;line-height:1.7}
  .bars{text-align:center;font-size:2em;letter-spacing:4px;margin:10px 0 2px}
</style></head><body>
<div class="receipt">
  <div class="logo">
    <div class="biz">BSC MARKETPLACE</div>
    <div class="sub">Bahamian Seafood Connection</div>
    <div class="sub">Firetrial Road, Nassau, Bahamas</div>
    <div class="sub">bahamianseafoodconnection@gmail.com</div>
  </div>
  <div class="meta"><span><strong>Invoice:</strong> ${invoice.id}</span><span>${invoice.date}</span></div>
  <div class="section">
    <div style="font-weight:bold">${customerName}</div>
    <div style="font-size:0.78em;color:#555">Tel: ${customerPhone}</div>
  </div>
  <div class="section">
    ${invoice.items.map((item: any) => `
      <div class="item-row">
        <div style="flex:1"><div class="item-name">${item.productName}</div><div class="item-meta">${item.qty} x $${Number(item.price).toFixed(2)}</div></div>
        <div class="item-total">$${Number(item.total).toFixed(2)}</div>
      </div>`).join('')}
  </div>
  <div class="totals">
    <div class="total-row"><span style="font-size:1.1em;font-weight:bold">TOTAL</span><span class="grand">$${cartTotal.toFixed(2)}</span></div>
    ${paymentMethod === 'cash'
      ? `<div class="total-row sm"><span>Cash Given</span><span>$${cashNum.toFixed(2)}</span></div><div class="total-row sm" style="font-weight:bold"><span>Change Due</span><span>$${change.toFixed(2)}</span></div>`
      : `<div class="total-row sm"><span>Payment</span><span>Card / Terminal</span></div>`}
  </div>
  <div class="bars">|||||||||||||||</div>
  <div style="text-align:center;font-size:0.65em;color:#888;margin-bottom:4px">${invoice.id}</div>
  <div class="footer">
    <div>Thank you for shopping at BSC Marketplace!</div>
    <div>Fresh · Local · Bahamian 🐟</div>
    <div style="margin-top:4px">WhatsApp: ${BSC_WHATSAPP_DISPLAY}</div>
  </div>
</div></body></html>`;
    const w = window.open('', '_blank', 'width=500,height=700');
    if (!w) return;
    w.document.write(receiptHTML);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
    setInvoiceSent(prev => [...prev, 'print']);
  }, [cartTotal, cashNum, change, customerName, customerPhone, paymentMethod]);

  const sendWhatsApp = useCallback((invoice: any) => {
    let raw = customerPhone.replace(/\D/g, '');
    if (raw.startsWith('1242') && raw.length === 11) {}
    else if (raw.startsWith('242') && raw.length === 10) raw = '1' + raw;
    else if (raw.length === 7) raw = '1242' + raw;
    else if (!raw.startsWith('1')) raw = '1242' + raw;
    const text =
      `*BSC MARKETPLACE*\nFiretrial Road, Nassau\n\n*Invoice: ${invoice.id}*\nDate: ${invoice.date}\n\nCustomer: ${customerName}\nTel: ${customerPhone}\n\n*Items:*\n` +
      invoice.items.map((i: any) => `• ${i.productName}  x${i.qty}  =  $${Number(i.total).toFixed(2)}`).join('\n') +
      `\n\n*TOTAL: $${cartTotal.toFixed(2)}*\n` +
      (paymentMethod === 'cash' ? `Cash: $${cashNum.toFixed(2)}  |  Change: $${change.toFixed(2)}\n` : '') +
      `\nThank you for shopping at BSC! 🐟`;
    window.open(`https://api.whatsapp.com/send?phone=${raw}&text=${encodeURIComponent(text)}`, '_blank');
    setInvoiceSent(prev => [...prev, 'whatsapp']);
  }, [cartTotal, cashNum, change, customerName, customerPhone, paymentMethod]);

  const resetSale = useCallback(() => {
    setCart([]); setCustomerName(''); setCustomerPhone('');
    setCustomerQuery(''); setSuggestions([]);
    setPaymentMethod(null); setCashGiven('');
    setCompletedInvoice(null); setInvoiceSent([]); setSearch('');
    setScreen('shop');
  }, []);

  const customerInputProps = {
    customerQuery, customerName, customerPhone, suggestions,
    onQueryChange: handleCustomerQuery,
    onSelect: selectCustomer,
    onClear: clearCustomer,
    onNameChange: setCustomerName,
    onPhoneChange: setCustomerPhone,
  };

  // ── SHOP ──
  if (screen === 'shop') return (
    <POSLayout showWaPanel={showWaPanel} setShowWaPanel={setShowWaPanel}>
      <div style={pg}>
        {isControlAdmin && <BSCControlBack router={router} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, color: '#f5c518', fontSize: 20, fontWeight: 'bold' }}>🛒 Walking POS</h1>
            <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>BSC Marketplace · Firetrial Rd · 38% Margin</p>
          </div>
          {cartCount > 0 && (
            <button onClick={() => setScreen('cart')} style={{ backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: 12, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>
              🛒 {cartCount} · ${cartTotal.toFixed(2)}
            </button>
          )}
        </div>
        <CustomerInputBlock {...customerInputProps} />
        <input placeholder="🔍 Search products..." value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" style={{ ...inp, marginBottom: 14 }} />
        {filtered.length === 0 && <p style={{ color: '#4a5568', textAlign: 'center', padding: 30 }}>No products found</p>}
        {filtered.map(product => {
          const inCart = cart.find(c => c.id === product.id);
          return (
            <div key={product.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{product.name}</p>
                  <p style={{ margin: '4px 0 2px', color: '#4ade80', fontSize: 18, fontWeight: 'bold' }}>${product.price.toFixed(2)}</p>
                  <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{product.stock - product.minStock} available</p>
                </div>
                {inCart ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => adjustQty(product.id, -1)} style={qtyBtnStyle('#1e3a5f')}>−</button>
                    <span style={{ fontWeight: 'bold', fontSize: 16, minWidth: 22, textAlign: 'center' as const }}>{inCart.qty}</span>
                    <button onClick={() => adjustQty(product.id, 1)} style={qtyBtnStyle('#f5c518', '#000')}>+</button>
                  </div>
                ) : (
                  <button onClick={() => addToCart(product)} style={{ padding: '10px 18px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>Add</button>
                )}
              </div>
            </div>
          );
        })}
        {cartCount > 0 && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px', backgroundColor: '#070e1d', borderTop: '1px solid #1e3a5f', zIndex: 100 }}>
            <button onClick={() => setScreen('cart')} style={primaryBtn}>View Cart ({cartCount} items) · ${cartTotal.toFixed(2)} →</button>
          </div>
        )}
      </div>
    </POSLayout>
  );

  // ── CART ──
  if (screen === 'cart') return (
    <POSLayout showWaPanel={showWaPanel} setShowWaPanel={setShowWaPanel}>
      <div style={pg}>
        {isControlAdmin && <BSCControlBack router={router} />}
        <button onClick={() => setScreen('shop')} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 14, cursor: 'pointer', marginBottom: 14, padding: 0 }}>← Back to Products</button>
        <h2 style={{ margin: '0 0 16px', color: '#f5c518', fontSize: 20 }}>🛒 Cart Review</h2>
        <CustomerInputBlock {...customerInputProps} />
        {cart.map(item => (
          <div key={item.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{item.name}</p>
                <p style={{ margin: '3px 0 0', color: '#aaa', fontSize: 13 }}>{item.qty} × ${item.price.toFixed(2)} = <span style={{ color: '#4ade80', fontWeight: 'bold' }}>${(item.qty * item.price).toFixed(2)}</span></p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button onClick={() => adjustQty(item.id, -1)} style={qtyBtnStyle('#1e3a5f')}>−</button>
                <span style={{ fontWeight: 'bold', fontSize: 15, minWidth: 22, textAlign: 'center' as const }}>{item.qty}</span>
                <button onClick={() => adjustQty(item.id, 1)} style={qtyBtnStyle('#f5c518', '#000')}>+</button>
              </div>
            </div>
          </div>
        ))}
        <div style={{ ...card, backgroundColor: '#0a1f0a', borderColor: '#4ade80', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, color: '#4ade80', fontSize: 16, fontWeight: 'bold' }}>Total</p>
          <p style={{ margin: 0, color: '#4ade80', fontSize: 24, fontWeight: 'bold' }}>${cartTotal.toFixed(2)}</p>
        </div>
        <button onClick={() => { if (!customerName || !customerPhone) { alert('Please enter customer name and phone'); return; } setScreen('payment'); }} style={primaryBtn}>Proceed to Payment →</button>
        <button onClick={() => setScreen('shop')} style={secondaryBtn}>← Add More Items</button>
      </div>
    </POSLayout>
  );

  // ── PAYMENT ──
  if (screen === 'payment') return (
    <POSLayout showWaPanel={showWaPanel} setShowWaPanel={setShowWaPanel}>
      <div style={pg}>
        {isControlAdmin && <BSCControlBack router={router} />}
        <button onClick={() => setScreen('cart')} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 14, cursor: 'pointer', marginBottom: 14, padding: 0 }}>← Back to Cart</button>
        <h2 style={{ margin: '0 0 6px', color: '#f5c518', fontSize: 20 }}>💳 Payment</h2>
        <p style={{ margin: '0 0 20px', color: '#4a5568', fontSize: 13 }}>{customerName} · {customerPhone}</p>
        <div style={{ ...card, backgroundColor: '#0a1f0a', borderColor: '#4ade80', textAlign: 'center', padding: 20, marginBottom: 20 }}>
          <p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 12, letterSpacing: 1 }}>AMOUNT DUE</p>
          <p style={{ margin: 0, color: '#4ade80', fontSize: 36, fontWeight: 'bold' }}>${cartTotal.toFixed(2)}</p>
        </div>
        <p style={{ color: '#6b7280', fontSize: 11, letterSpacing: 1, marginBottom: 10 }}>SELECT PAYMENT METHOD</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[{ method: 'cash' as PaymentMethod, icon: '💵', label: 'Cash' }, { method: 'card' as PaymentMethod, icon: '💳', label: 'Card' }].map(opt => (
            <button key={opt.label} onClick={() => setPaymentMethod(opt.method)} style={{ padding: '20px 16px', borderRadius: 14, backgroundColor: paymentMethod === opt.method ? '#f5c518' : '#0d1f3c', color: paymentMethod === opt.method ? '#000' : '#aaa', border: paymentMethod === opt.method ? 'none' : '1px solid #1e3a5f', fontWeight: 'bold', fontSize: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 28 }}>{opt.icon}</span>{opt.label}
            </button>
          ))}
        </div>
        {paymentMethod === 'cash' && (
          <div style={card}>
            <p style={{ margin: '0 0 10px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>Cash Given</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' as const }}>
              {[cartTotal, Math.ceil(cartTotal / 5) * 5, Math.ceil(cartTotal / 10) * 10, Math.ceil(cartTotal / 20) * 20, 50, 100]
                .filter((v, i, a) => a.indexOf(v) === i && v >= cartTotal).slice(0, 5).map(amt => (
                <button key={amt} onClick={() => setCashGiven(amt.toFixed(2))} style={{ padding: '8px 14px', borderRadius: 8, backgroundColor: cashNum === amt ? '#f5c518' : '#1e3a5f', color: cashNum === amt ? '#000' : '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}>${amt.toFixed(0)}</button>
              ))}
            </div>
            <input type="number" placeholder="Or enter amount..." value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} style={{ ...inp, fontSize: 22, fontWeight: 'bold', marginBottom: 0 }} />
            {cashNum >= cartTotal && cartTotal > 0 && (
              <div style={{ marginTop: 12, backgroundColor: '#0a1f0a', borderRadius: 10, padding: '14px', border: '1px solid #4ade80' }}>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 12 }}>Change Due</p>
                <p style={{ margin: '4px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 28 }}>${change.toFixed(2)}</p>
              </div>
            )}
            {cashNum > 0 && cashNum < cartTotal && (
              <div style={{ marginTop: 12, backgroundColor: '#2d0000', borderRadius: 10, padding: '12px 14px', border: '1px solid #f87171' }}>
                <p style={{ margin: 0, color: '#f87171', fontSize: 13 }}>⚠️ Short by ${(cartTotal - cashNum).toFixed(2)}</p>
              </div>
            )}
          </div>
        )}
        {paymentMethod === 'card' && (
          <div style={{ ...card, textAlign: 'center', padding: 24 }}>
            <p style={{ margin: '0 0 8px', fontSize: 36 }}>💳</p>
            <p style={{ margin: 0, color: '#aaa', fontSize: 15 }}>Process card on terminal</p>
            <p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 12 }}>Tap Complete Sale when confirmed</p>
          </div>
        )}
        <button onClick={handleCompleteSale} disabled={processing || !paymentMethod || (paymentMethod === 'cash' && cashNum < cartTotal)} style={{ ...primaryBtn, marginTop: 16, backgroundColor: processing ? '#555' : (!paymentMethod || (paymentMethod === 'cash' && cashNum < cartTotal)) ? '#2a2a2a' : '#f5c518', color: (!paymentMethod || (paymentMethod === 'cash' && cashNum < cartTotal)) ? '#555' : '#000', cursor: (processing || !paymentMethod) ? 'not-allowed' : 'pointer' }}>
          {processing ? '⏳ Processing...' : '✅ Complete Sale'}
        </button>
      </div>
    </POSLayout>
  );

  // ── COMPLETE ──
  if (screen === 'complete' && completedInvoice) return (
    <POSLayout showWaPanel={showWaPanel} setShowWaPanel={setShowWaPanel}>
      <div style={pg}>
        {isControlAdmin && <BSCControlBack router={router} />}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 56, marginBottom: 10 }}>✅</div>
          <h2 style={{ margin: '0 0 4px', color: '#4ade80', fontSize: 22 }}>Sale Complete!</h2>
          <p style={{ margin: 0, color: '#4a5568', fontSize: 13 }}>{completedInvoice.id}</p>
        </div>
        <div style={{ backgroundColor: '#fff', color: '#111', borderRadius: 14, padding: 20, marginBottom: 20, fontFamily: 'monospace' }}>
          <div style={{ textAlign: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px dashed #ccc' }}>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>BSC MARKETPLACE</p>
            <p style={{ margin: '2px 0', fontSize: 11, color: '#666' }}>Bahamian Seafood Connection</p>
            <p style={{ margin: '2px 0', fontSize: 11, color: '#666' }}>Firetrial Road, Nassau, Bahamas</p>
            <p style={{ margin: '4px 0 0', fontSize: 10, color: '#999' }}>{completedInvoice.date} · {completedInvoice.id}</p>
          </div>
          <p style={{ margin: '0 0 2px', fontWeight: 'bold', fontSize: 14 }}>{customerName}</p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#555' }}>📱 {customerPhone}</p>
          {completedInvoice.items.map((item: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottom: '1px dotted #ddd' }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>{item.productName}</p>
                <p style={{ margin: 0, fontSize: 11, color: '#888' }}>{item.qty} × ${Number(item.price).toFixed(2)}</p>
              </div>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>${Number(item.total).toFixed(2)}</p>
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
                <p style={{ margin: 0, fontSize: 12 }}>${cashNum.toFixed(2)}</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <p style={{ margin: 0, color: '#555', fontSize: 12 }}>Change</p>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>${change.toFixed(2)}</p>
              </div>
            </>
          )}
          <p style={{ margin: '12px 0 0', color: '#999', fontSize: 10, textAlign: 'center' as const }}>Thank you for shopping at BSC Marketplace 🐟</p>
        </div>
        <p style={{ color: '#6b7280', fontSize: 11, letterSpacing: 1, margin: '0 0 10px' }}>SEND INVOICE TO CUSTOMER</p>
        <button onClick={() => handlePrint(completedInvoice)} style={{ ...primaryBtn, backgroundColor: invoiceSent.includes('print') ? '#0a1f0a' : '#f5c518', color: invoiceSent.includes('print') ? '#4ade80' : '#000', border: invoiceSent.includes('print') ? '1px solid #4ade80' : 'none' }}>
          {invoiceSent.includes('print') ? '✅ Printed' : '🖨️ Print Receipt'}
        </button>
        <button onClick={() => sendWhatsApp(completedInvoice)} style={{ ...primaryBtn, backgroundColor: invoiceSent.includes('whatsapp') ? '#0a2010' : '#25d366', color: invoiceSent.includes('whatsapp') ? '#4ade80' : '#fff', border: invoiceSent.includes('whatsapp') ? '1px solid #4ade80' : 'none' }}>
          {invoiceSent.includes('whatsapp') ? '✅ Sent via WhatsApp' : '💬 Send via WhatsApp'}
        </button>
        <button onClick={() => {
          const subject = encodeURIComponent(`BSC Marketplace Invoice ${completedInvoice.id}`);
          const body = encodeURIComponent(
            `BSC MARKETPLACE\nFiretrial Road, Nassau, Bahamas\n\nInvoice: ${completedInvoice.id}\nDate: ${completedInvoice.date}\nCustomer: ${customerName}\n\nItems:\n` +
            completedInvoice.items.map((i: any) => `${i.productName} x${i.qty} = $${Number(i.total).toFixed(2)}`).join('\n') +
            `\n\nTOTAL: $${cartTotal.toFixed(2)}\n\nThank you!\nbahamianseafoodconnection@gmail.com`
          );
          window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
          setInvoiceSent(prev => [...prev, 'email']);
        }} style={{ ...primaryBtn, backgroundColor: invoiceSent.includes('email') ? '#001a2a' : '#60a5fa', color: invoiceSent.includes('email') ? '#60a5fa' : '#000', border: invoiceSent.includes('email') ? '1px solid #60a5fa' : 'none' }}>
          {invoiceSent.includes('email') ? '✅ Email Opened' : '📧 Send via Email'}
        </button>
        <button onClick={() => router.push('/invoice?id=' + encodeURIComponent(completedInvoice.id))} style={{ ...primaryBtn, backgroundColor: 'transparent', color: '#f5c518', border: '1px solid #f5c518' }}>
          📄 View Full Invoice
        </button>
        <button onClick={resetSale} style={secondaryBtn}>＋ New Sale</button>
      </div>
    </POSLayout>
  );

  return null;
}
