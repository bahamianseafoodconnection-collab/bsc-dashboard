// File: app/pos/page.tsx
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  products,
  completeSale,
  saveCustomer,
  searchCustomers,
  type Product,
  type Customer,
} from '../../lib/store';
import { recordSaleFinancials } from '../../lib/finance';
import { createInvoice } from '../../lib/invoices';

type CartItem = Product & { qty: number };
type PaymentMethod = 'cash' | 'card' | null;
type Screen = 'shop' | 'cart' | 'payment' | 'complete';

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

// ── WHATSAPP PANEL — defined outside main component ──
function WhatsAppPanel({ side }: { side: 'top' | 'right' }) {
  const [waTab, setWaTab] = useState<'web' | 'qr'>('web');
  const isRight = side === 'right';

  return (
    <div style={{
      backgroundColor: '#070e1d', border: '1px solid #25d366',
      borderRadius: isRight ? 16 : 12, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      height: isRight ? '100vh' : 'auto',
      position: isRight ? 'sticky' : 'relative',
      top: isRight ? 0 : undefined,
    }}>
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

// ── CUSTOMER DROPDOWN — defined outside main component ──
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

// ── POS LAYOUT — defined outside main component ──
function POSLayout({ children, showWaPanel, setShowWaPanel }: {
  children: React.ReactNode;
  showWaPanel: boolean;
  setShowWaPanel: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#060d1f' }}>
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', paddingBottom: 80 }}>
        {children}
      </div>

      {/* Desktop WhatsApp panel */}
      <div className="wa-panel-desktop" style={{ width: 380, flexShrink: 0, backgroundColor: '#070e1d', borderLeft: '1px solid #25d36633', display: 'none' }}>
        <WhatsAppPanel side="right" />
      </div>

      {/* Mobile floating button */}
      <button onClick={() => setShowWaPanel(!showWaPanel)} className="wa-toggle-mobile" style={{ position: 'fixed', bottom: 80, right: 16, width: 52, height: 52, borderRadius: '50%', backgroundColor: '#25d366', color: '#000', border: 'none', fontSize: 26, cursor: 'pointer', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(37,211,102,0.4)' }}>
        💬
      </button>

      {/* Mobile drawer */}
      {showWaPanel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column' }}>
          <div onClick={() => setShowWaPanel(false)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)' }} />
          <div style={{ position: 'relative', zIndex: 1, margin: 'auto 0 0', height: '80vh', backgroundColor: '#070e1d', borderRadius: '20px 20px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #1e3a5f' }}>
              <p style={{ margin: 0, color: '#25d366', fontWeight: 'bold', fontSize: 15 }}>💬 BSC WhatsApp</p>
              <button onClick={() => setShowWaPanel(false)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <WhatsAppPanel side="top" />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (min-width: 900px) {
          .wa-panel-desktop { display: block !important; }
          .wa-toggle-mobile { display: none !important; }
        }
        @media (max-width: 899px) {
          .wa-panel-desktop { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ── MAIN POS PAGE ──
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
      return ex
        ? prev.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c)
        : [...prev, { ...product, qty: 1 }];
    });
  }, []);

  const adjustQty = useCallback((id: string, delta: number) => {
    setCart(prev =>
      prev.map(c => c.id === id ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0)
    );
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
    <div style="font-weight​​​​​​​​​​​​​​​​
