'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const FEE_RATE        = 0.045;
const SUB_PRICE       = 60;

const UTILITIES = [
  { id: 'bec',   name: 'BEC',   label: 'Bahamas Electricity', emoji: '⚡', color: '#fef9e7' },
  { id: 'water', name: 'Water', label: 'Water & Sewage',       emoji: '💧', color: '#e8f8fd' },
  { id: 'cable', name: 'Cable', label: 'Cable Bahamas',        emoji: '📺', color: '#f5f0ff' },
  { id: 'aliv',  name: 'Aliv',  label: 'Aliv Mobile',         emoji: '📱', color: '#e8f4fd' },
  { id: 'btc',   name: 'BTC',   label: 'BTC Bahamas',         emoji: '☎️', color: '#f0fde8' },
  { id: 'flow',  name: 'Flow',  label: 'Flow Bahamas',        emoji: '🌐', color: '#fde8f0' },
];

type Screen = 'home' | 'form' | 'receipt' | 'admin';

type Payment = {
  id: string;
  utility: string;
  amount: number;
  fee: number;
  total: number;
  customer_name: string;
  customer_phone: string;
  account_number: string;
  payment_method: string;
  reference: string;
  status: string;
  is_subscriber: boolean;
  created_at: string;
};

const MOCK_PAYMENTS: Payment[] = [
  { id: '1', utility: 'BEC', amount: 200, fee: 9, total: 209, customer_name: 'Maria Johnson', customer_phone: '2421234567', account_number: 'BEC-12345', payment_method: 'cash', reference: 'BSC-BILL-001', status: 'Pending', is_subscriber: false, created_at: new Date().toISOString() },
  { id: '2', utility: 'Water', amount: 85, fee: 0, total: 85, customer_name: 'David Smith', customer_phone: '2429876543', account_number: 'WAT-67890', payment_method: 'card', reference: 'BSC-BILL-002', status: 'Processed', is_subscriber: true, created_at: new Date(Date.now() - 3600000).toISOString() },
];

export default function UtilitiesPage() {
  const [screen, setScreen]               = useState<Screen>('home');
  const [selectedUtil, setSelectedUtil]   = useState(UTILITIES[0]);
  const [billAmount, setBillAmount]       = useState('');
  const [customerName, setCustomerName]   = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [isSubscriber, setIsSubscriber]   = useState(false);
  const [lastPayment, setLastPayment]     = useState<Payment | null>(null);
  const [payments, setPayments]           = useState<Payment[]>(MOCK_PAYMENTS);
  const [loading, setLoading]             = useState(false);

  const amount    = parseFloat(billAmount) || 0;
  const fee       = isSubscriber ? 0 : Math.round(amount * FEE_RATE * 100) / 100;
  const total     = amount + fee;

  function selectUtility(util: typeof UTILITIES[0]) {
    setSelectedUtil(util);
    setScreen('form');
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0) return;
    setLoading(true);
    const ref = 'BSC-BILL-' + Date.now().toString().slice(-6);
    const payment: Payment = {
      id:             ref,
      utility:        selectedUtil.name,
      amount,
      fee,
      total,
      customer_name:  customerName,
      customer_phone: customerPhone,
      account_number: accountNumber,
      payment_method: paymentMethod,
      reference:      ref,
      status:         'Pending',
      is_subscriber:  isSubscriber,
      created_at:     new Date().toISOString(),
    };
    try {
      await supabase.from('utility_payments').insert([payment]);
    } catch { /* continue */ }
    setPayments((prev) => [payment, ...prev]);
    setLastPayment(payment);
    setScreen('receipt');
    setLoading(false);
  }

  async function markProcessed(id: string) {
    await supabase.from('utility_payments').update({ status: 'Processed' }).eq('id', id);
    setPayments((prev) => prev.map((p) => p.id === id ? { ...p, status: 'Processed' } : p));
  }

  function resetForm() {
    setBillAmount('');
    setCustomerName('');
    setCustomerPhone('');
    setAccountNumber('');
    setPaymentMethod('cash');
    setIsSubscriber(false);
    setLastPayment(null);
    setScreen('home');
  }

  /* ── HOME ── */
  if (screen === 'home') return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/dashboard" style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, textDecoration: 'none', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>
              ← BSC Control
            </Link>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>Bill Payments</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>4.5% service fee · $60/yr subscription</div>
            </div>
          </div>
          <button onClick={() => setScreen('admin')} style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#f4c842', border: 'none', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            Admin Panel
          </button>
        </div>
      </header>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '28px 16px' }}>
        <div style={{ backgroundColor: '#1a2e5a', borderRadius: '16px', padding: '20px', marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '16px' }}>Annual Subscription</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginTop: '4px' }}>Pay $60/year — zero service fees forever</div>
          </div>
          <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '24px' }}>$60<span style={{ fontSize: '13px', fontWeight: 600 }}>/yr</span></div>
        </div>

        <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px', marginBottom: '16px' }}>Select Utility</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {UTILITIES.map((util) => (
            <button
              key={util.id}
              onClick={() => selectUtility(util)}
              style={{ backgroundColor: '#fff', border: '2px solid #f0f0f0', borderRadius: '16px', padding: '20px 16px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', textAlign: 'left', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
            >
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: util.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
                {util.emoji}
              </div>
              <div>
                <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '15px' }}>{util.name}</div>
                <div style={{ color: '#999', fontSize: '12px' }}>{util.label}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  /* ── FORM ── */
  if (screen === 'form') return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '56px' }}>
          <button onClick={() => setScreen('home')} style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>
            ← Back
          </button>
          <div style={{ fontSize: '24px' }}>{selectedUtil.emoji}</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>{selectedUtil.name} Payment</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>{selectedUtil.label}</div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '24px 16px' }}>
        <form onSubmit={submitPayment}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '15px', marginBottom: '16px' }}>Customer Details</h3>

            {[
              { label: 'Customer Name', value: customerName, setter: setCustomerName, placeholder: 'Full name', type: 'text', required: true },
              { label: 'WhatsApp Number', value: customerPhone, setter: setCustomerPhone, placeholder: '+1 (242) 000-0000', type: 'tel', required: false },
              { label: 'Account Number', value: accountNumber, setter: setAccountNumber, placeholder: `${selectedUtil.name} account number`, type: 'text', required: true },
            ].map((field) => (
              <div key={field.label} style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>{field.label}</label>
                <input
                  type={field.type}
                  value={field.value}
                  onChange={(e) => field.setter(e.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '15px', marginBottom: '16px' }}>Payment Details</h3>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Bill Amount ($)</label>
              <input
                type="number"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                placeholder="0.00"
                min="1"
                step="0.01"
                required
                style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '20px', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={isSubscriber} onChange={(e) => setIsSubscriber(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                <span style={{ color: '#1a2e5a', fontSize: '14px', fontWeight: 600 }}>Annual Subscriber (no fee)</span>
              </label>
            </div>

            <div style={{ backgroundColor: '#f8f9fa', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#666', fontSize: '13px' }}>Bill Amount</span>
                <span style={{ color: '#1a2e5a', fontWeight: 700 }}>${amount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#666', fontSize: '13px' }}>Service Fee {isSubscriber ? '(Waived ✓)' : '(4.5%)'}</span>
                <span style={{ color: isSubscriber ? '#2e7d32' : '#d97706', fontWeight: 700 }}>${fee.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
                <span style={{ color: '#1a2e5a', fontSize: '15px', fontWeight: 800 }}>Customer Pays</span>
                <span style={{ color: '#1a2e5a', fontSize: '18px', fontWeight: 900 }}>${total.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
              {(['cash', 'card', 'transfer'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setPaymentMethod(m)} style={{ padding: '10px', borderRadius: '10px', border: '2px solid', borderColor: paymentMethod === m ? '#1a2e5a' : '#e5e7eb', backgroundColor: paymentMethod === m ? '#1a2e5a' : '#fff', color: paymentMethod === m ? '#f4c842' : '#666', fontSize: '12px', fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
                  {m === 'cash' ? '💵' : m === 'card' ? '💳' : '🏦'} {m}
                </button>
              ))}
            </div>

            {paymentMethod === 'cash' && (
              <div style={{ backgroundColor: '#fef9e7', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
                <div style={{ color: '#d97706', fontSize: '13px', fontWeight: 700 }}>⚠️ Cash Payment</div>
                <div style={{ color: '#92400e', fontSize: '12px', marginTop: '4px' }}>Customer must visit BSC store to complete cash payment.</div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || amount <= 0}
            style={{ width: '100%', backgroundColor: loading || amount <= 0 ? '#e5e7eb' : '#f4c842', color: loading || amount <= 0 ? '#999' : '#1a2e5a', border: 'none', borderRadius: '14px', padding: '16px', fontWeight: 900, fontSize: '16px', cursor: loading || amount <= 0 ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Processing...' : `Submit Payment · $${total.toFixed(2)}`}
          </button>
        </form>
      </div>
    </div>
  );

  /* ── RECEIPT ── */
  if (screen === 'receipt' && lastPayment) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '420px', backgroundColor: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div style={{ backgroundColor: '#1a2e5a', padding: '28px', textAlign: 'center' }}>
          <div style={{ fontSize: '44px', marginBottom: '10px' }}>✅</div>
          <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '22px' }}>Payment Submitted!</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', marginTop: '6px' }}>Ref: {lastPayment.reference}</div>
        </div>
        <div style={{ padding: '24px' }}>
          {[
            { label: 'Utility', value: `${UTILITIES.find((u) => u.name === lastPayment.utility)?.emoji} ${lastPayment.utility}` },
            { label: 'Customer', value: lastPayment.customer_name },
            { label: 'Account', value: lastPayment.account_number },
            { label: 'Bill Amount', value: `$${lastPayment.amount.toFixed(2)}` },
            { label: 'Service Fee', value: lastPayment.is_subscriber ? '$0.00 (Subscriber)' : `$${lastPayment.fee.toFixed(2)}` },
            { label: 'Total Paid', value: `$${lastPayment.total.toFixed(2)}` },
            { label: 'Payment', value: lastPayment.payment_method.charAt(0).toUpperCase() + lastPayment.payment_method.slice(1) },
          ].map((row) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
              <span style={{ color: '#999', fontSize: '13px' }}>{row.label}</span>
              <span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '13px' }}>{row.value}</span>
            </div>
          ))}

          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <a
              href={`https://wa.me/${lastPayment.customer_phone}?text=BSC Bill Payment Receipt — ${lastPayment.utility} — Ref: ${lastPayment.reference} — Amount: $${lastPayment.total.toFixed(2)} — Status: Pending. Visit BSC store if paying cash.`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'block', backgroundColor: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: '12px', padding: '13px', textAlign: 'center', fontWeight: 800, fontSize: '14px' }}
            >
              💬 Send Receipt via WhatsApp
            </a>

            <button
              onClick={() => window.print()}
              style={{ width: '100%', backgroundColor: '#f8f9fa', color: '#1a2e5a', border: '1.5px solid #e5e7eb', borderRadius: '12px', padding: '12px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}
            >
              🖨️ Print Receipt
            </button>

            <button
              onClick={resetForm}
              style={{ width: '100%', backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '12px', padding: '13px', fontWeight: 900, fontSize: '14px', cursor: 'pointer' }}
            >
              + New Payment
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── ADMIN PANEL ── */
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setScreen('home')} style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>
              ← Back
            </button>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>Admin · All Payments</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>{payments.length} total records</div>
            </div>
          </div>
          <Link href="/dashboard" style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>BSC Control →</Link>
        </div>
      </header>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {payments.map((p) => (
            <div key={p.id} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: UTILITIES.find((u) => u.name === p.utility)?.color || '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                  {UTILITIES.find((u) => u.name === p.utility)?.emoji}
                </div>
                <div>
                  <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px' }}>{p.customer_name}</div>
                  <div style={{ color: '#999', fontSize: '11px' }}>{p.utility} · {p.reference} {p.is_subscriber && '· ⭐ Subscriber'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '16px' }}>${p.total.toFixed(2)}</div>
                  <div style={{ color: '#2e7d32', fontSize: '11px', fontWeight: 700 }}>Fee: ${p.fee.toFixed(2)}</div>
                </div>
                <span style={{ backgroundColor: p.status === 'Processed' ? '#e8f5e9' : '#fef9e7', color: p.status === 'Processed' ? '#2e7d32' : '#d97706', fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '20px' }}>
                  {p.status}
                </span>
                {p.status !== 'Processed' && (
                  <button onClick={() => markProcessed(p.id)} style={{ backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                    Mark Processed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}