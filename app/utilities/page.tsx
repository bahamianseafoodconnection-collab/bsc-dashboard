'use client';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import CardPaymentModal, { PaymentPayload } from '@/components/CardPaymentModal';
import MarketplaceTabs from '@/components/MarketplaceTabs';

const BASE = 'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

const SERVICE_FEE  = 6.00;
const BSC_RATE_PCT = 4.5;

const BILL_TYPES = [
  { key: 'bec',      label: 'BEC – Electricity',       icon: '⚡', color: '#f59e0b' },
  { key: 'water',    label: 'WSC – Water & Sewerage',   icon: '💧', color: '#3b82f6' },
  { key: 'aliv',     label: 'Aliv – Mobile',            icon: '📱', color: '#8b5cf6' },
  { key: 'btc',      label: 'BTC – Telephone',          icon: '📞', color: '#10b981' },
  { key: 'internet', label: 'Internet / Cable',         icon: '🌐', color: '#06b6d4' },
  { key: 'cable',    label: 'Cable Bahamas',            icon: '📺', color: '#ef4444' },
  { key: 'nis',      label: 'NIS – National Insurance', icon: '🏛️', color: '#6366f1' },
  { key: 'other',    label: 'Other Bill',               icon: '📄', color: '#64748b' },
];

type View = 'details' | 'invoice' | 'payment' | 'done';

function fmt(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function calcFees(amount: number) {
  const bscFee     = parseFloat((amount * BSC_RATE_PCT / 100).toFixed(2));
  const serviceFee = SERVICE_FEE;
  const total      = parseFloat((amount + bscFee + serviceFee).toFixed(2));
  return { bscFee, serviceFee, total };
}

export default function UtilitiesPage() {
  const router = useRouter();
  const [view, setView]               = useState<View>('details');
  const [billType, setBillType]       = useState('');
  const [accountNo, setAccountNo]     = useState('');
  const [accountName, setAccountName] = useState('');
  const [amountStr, setAmountStr]     = useState('');
  const [refNo, setRefNo]             = useState('');
  const [last4, setLast4]             = useState('');

  const amount = parseFloat(amountStr.replace(/,/g, '')) || 0;
  const { bscFee, serviceFee, total } = calcFees(amount);
  const bill = BILL_TYPES.find(b => b.key === billType);

  const payload: PaymentPayload = {
    amount,
    fees:        bscFee + serviceFee,
    total,
    description: `${bill?.label || 'Bill'} — Acct ${accountNo}`,
    receiptType: 'utility',
    metadata:    { bill_type: billType, account_no: accountNo, account_name: accountName, bsc_fee: bscFee, service_fee: serviceFee },
  };

  function reset() {
    setBillType(''); setAccountNo(''); setAccountName('');
    setAmountStr(''); setRefNo(''); setLast4(''); setView('details');
  }

  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#1a2e4a', backgroundColor: '#fff', fontFamily: 'inherit', outline: 'none' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 800 as const, color: '#475569', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 7 };

  const STEPS = [
    { key: 'details', label: 'Details'  },
    { key: 'invoice', label: 'Invoice'  },
    { key: 'payment', label: 'Payment'  },
  ];
  const stepIdx = STEPS.findIndex(s => s.key === view);

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        input:focus { border-color: #1a2e4a !important; box-shadow: 0 0 0 3px rgba(26,46,74,0.1) !important; outline: none; }
        input::placeholder { color: #cbd5e1; }
        .bill-btn { transition: all 0.18s; font-family: inherit; }
        .bill-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0,0,0,0.1); }
        .bsc-btn { transition: opacity 0.15s, transform 0.15s; }
        .bsc-btn:hover { opacity: 0.9; transform: translateY(-1px); }
      `}</style>

      <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
        {/* Marketplace tabs — same three cards as /market, so customers
            can hop back to Fishermen / Farmers from the bill-pay flow
            with one tap. Suspense required: MarketplaceTabs uses
            useSearchParams. */}
        <Suspense fallback={null}>
          <MarketplaceTabs />
        </Suspense>
        <nav style={{ backgroundColor: '#1a2e4a', padding: '0 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
          <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={`${BASE}/logo.jpg`} alt="BSC" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f5a623', cursor: 'pointer' }} onClick={() => router.push('/')} />
              <div>
                <div style={{ color: '#f5a623', fontWeight: 900, fontSize: 14, letterSpacing: 1 }}>BSC Pay</div>
                <div style={{ color: '#94a3b8', fontSize: 10 }}>Bill Payment Service</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', padding: '5px 12px', borderRadius: 20 }}>
              <span style={{ fontSize: 12 }}>🔒</span>
              <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 600 }}>Secured by RBC</span>
            </div>
          </div>
        </nav>

        <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 60px' }}>

          {/* Progress */}
          {view !== 'done' && (
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
              {STEPS.map((s, i) => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: i < stepIdx ? '#22c55e' : i === stepIdx ? '#1a2e4a' : '#e2e8f0', color: i <= stepIdx ? '#fff' : '#94a3b8', fontWeight: 800, fontSize: 12, flexShrink: 0, transition: 'all 0.3s' }}>
                      {i < stepIdx ? '✓' : i + 1}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: i === stepIdx ? '#1a2e4a' : '#94a3b8', whiteSpace: 'nowrap' }}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, backgroundColor: i < stepIdx ? '#22c55e' : '#e2e8f0', margin: '0 10px', transition: 'background 0.3s' }} />}
                </div>
              ))}
            </div>
          )}

          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: '28px', boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>

            {/* ── DETAILS ── */}
            {view === 'details' && (
              <div style={{ animation: 'fadeUp 0.35s ease both' }}>
                <h1 style={{ fontSize: 21, fontWeight: 900, color: '#1a2e4a', marginBottom: 4 }}>Bill Payment</h1>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Select your bill and enter the payment amount.</p>

                <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>Select Bill Type</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 9, marginBottom: 24 }}>
                  {BILL_TYPES.map(b => (
                    <button key={b.key} className="bill-btn" onClick={() => setBillType(b.key)} style={{ padding: '11px 13px', borderRadius: 10, border: billType === b.key ? `2px solid ${b.color}` : '2px solid #e2e8f0', backgroundColor: billType === b.key ? `${b.color}12` : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, boxShadow: billType === b.key ? `0 0 0 3px ${b.color}1a` : 'none' }}>
                      <span style={{ fontSize: 19 }}>{b.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: billType === b.key ? b.color : '#475569', textAlign: 'left', lineHeight: 1.3 }}>{b.label}</span>
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                  <div><label style={lbl}>Account Number *</label><input value={accountNo} onChange={e => setAccountNo(e.target.value)} placeholder="e.g. 123456789" style={inp} /></div>
                  <div><label style={lbl}>Account Holder Name</label><input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Optional" style={inp} /></div>
                </div>

                <div style={{ marginBottom: 22 }}>
                  <label style={lbl}>Payment Amount (BSD) *</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, fontWeight: 700, color: '#1a2e4a' }}>$</span>
                    <input value={amountStr} onChange={e => setAmountStr(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" inputMode="decimal" style={{ ...inp, paddingLeft: 30, fontSize: 24, fontWeight: 800 }} />
                  </div>
                </div>

                {amount >= 1 && (
                  <div style={{ backgroundColor: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px 18px', marginBottom: 22 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>Fee Preview</div>
                    {[
                      { label: 'Payment Amount',                            value: amount,     main: true },
                      { label: `Cost of Doing Business (${BSC_RATE_PCT}%)`, value: bscFee               },
                      { label: 'Service Fee',                               value: serviceFee            },
                    ].map(r => (
                      <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: r.main ? 13 : 12, color: r.main ? '#1a2e4a' : '#64748b', fontWeight: r.main ? 800 : 500 }}>{r.label}</span>
                        <span style={{ fontSize: r.main ? 13 : 12, color: r.main ? '#1a2e4a' : '#64748b', fontWeight: 700 }}>{r.main ? '' : '+'}BSD ${fmt(r.value)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 6, borderTop: '2px solid #1a2e4a' }}>
                      <span style={{ fontWeight: 900, fontSize: 14, color: '#1a2e4a' }}>Total Due</span>
                      <span style={{ fontWeight: 900, fontSize: 22, color: '#1a2e4a' }}>BSD ${fmt(total)}</span>
                    </div>
                  </div>
                )}

                <button className="bsc-btn" onClick={() => setView('invoice')} disabled={!billType || !accountNo.trim() || amount < 1} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', backgroundColor: '#1a2e4a', color: '#f5a623', fontSize: 15, fontWeight: 900, cursor: billType && accountNo.trim() && amount >= 1 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: billType && accountNo.trim() && amount >= 1 ? 1 : 0.4 }}>
                  Review Invoice →
                </button>
              </div>
            )}

            {/* ── INVOICE ── */}
            {view === 'invoice' && (
              <div style={{ animation: 'fadeUp 0.35s ease both' }}>
                <h1 style={{ fontSize: 21, fontWeight: 900, color: '#1a2e4a', marginBottom: 4 }}>Review Invoice</h1>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Confirm line-by-line before paying.</p>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', marginBottom: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}>
                  {/* Header */}
                  <div style={{ backgroundColor: '#1a2e4a', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ color: '#f5a623', fontWeight: 900, fontSize: 15, letterSpacing: 1 }}>BSC MARKETPLACE</div>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 2 }}>Nassau, Bahamas · bscbahamas.com</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#f5a623', fontWeight: 900, fontSize: 18, letterSpacing: 2 }}>INVOICE</div>
                      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, marginTop: 2 }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                  </div>

                  {/* Bill to */}
                  <div style={{ padding: '14px 22px', backgroundColor: '#fafbfc', borderBottom: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 }}>Bill To</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2e4a' }}>{accountName || 'Account Holder'}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Account: {accountNo}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 }}>Bill Type</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2e4a' }}>{bill?.icon} {bill?.label}</div>
                    </div>
                  </div>

                  {/* Lines */}
                  <div style={{ padding: '0 22px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '10px 0 8px', borderBottom: '2px solid #1a2e4a' }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: '#1a2e4a', letterSpacing: 1, textTransform: 'uppercase' }}>Description</span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: '#1a2e4a', letterSpacing: 1, textTransform: 'uppercase' }}>Amount (BSD)</span>
                    </div>

                    {[
                      { label: `${bill?.label} — Payment`, sub: `Account: ${accountNo}`,                           amount: amount,     main: true  },
                      { label: `Cost of Doing Business — ${BSC_RATE_PCT}%`, sub: `${BSC_RATE_PCT}% × BSD $${fmt(amount)}`, amount: bscFee,     main: false },
                      { label: 'Service Fee — BSC Bill Payment', sub: 'Flat rate per transaction',                  amount: serviceFee, main: false },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: `${row.main ? 14 : 11}px 0`, borderBottom: '1px solid #f8fafc', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: row.main ? 700 : 600, fontSize: row.main ? 14 : 13, color: row.main ? '#1a2e4a' : '#64748b' }}>{row.label}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{row.sub}</div>
                        </div>
                        <div style={{ fontWeight: row.main ? 800 : 700, fontSize: row.main ? 15 : 13, color: row.main ? '#1a2e4a' : '#64748b' }}>BSD ${fmt(row.amount)}</div>
                      </div>
                    ))}

                    {/* Total */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '14px 0', borderTop: '3px solid #1a2e4a', marginTop: 2, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 15, color: '#1a2e4a' }}>TOTAL DUE</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>Payment Amount + All Fees</div>
                      </div>
                      <div style={{ fontWeight: 900, fontSize: 24, color: '#1a2e4a' }}>BSD ${fmt(total)}</div>
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#fff8e7', borderTop: '1px solid #fde68a', padding: '9px 22px', fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>
                    ℹ️ Your bill provider receives exactly BSD ${fmt(amount)}. Fees cover BSC's cost of processing.
                  </div>
                </div>

                {/* Card only */}
                <div style={{ backgroundColor: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 10, padding: '11px 15px', marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 20 }}>💳</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 12, color: '#0c4a6e' }}>Card Payment Only</div>
                    <div style={{ fontSize: 11, color: '#075985' }}>Debit & credit cards accepted. No wire transfer.</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setView('details')} style={{ padding: '13px 16px', borderRadius: 12, border: '2px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
                  <button className="bsc-btn" onClick={() => setView('payment')} style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', backgroundColor: '#1a2e4a', color: '#f5a623', fontSize: 14, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Continue to Pay via Card →
                  </button>
                </div>
              </div>
            )}

            {/* ── PAYMENT — shared CardPaymentModal ── */}
            {view === 'payment' && (
              <div style={{ animation: 'fadeUp 0.35s ease both' }}>
                <h1 style={{ fontSize: 21, fontWeight: 900, color: '#1a2e4a', marginBottom: 4 }}>Card Payment</h1>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Enter your debit or credit card details.</p>
                <CardPaymentModal
                  payload={payload}
                  onApproved={(ref, l4) => { setRefNo(ref); setLast4(l4); setView('done'); }}
                  onDeclined={() => {}}
                  onCancel={() => setView('invoice')}
                />
              </div>
            )}

            {/* ── DONE ── */}
            {view === 'done' && (
              <div style={{ textAlign: 'center', animation: 'fadeUp 0.4s ease both' }}>
                <div style={{ width: 88, height: 88, borderRadius: '50%', backgroundColor: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, margin: '0 auto 16px' }}>✅</div>
                <div style={{ fontWeight: 900, fontSize: 22, color: '#065f46', marginBottom: 6 }}>Payment Successful!</div>
                <div style={{ fontSize: 13, color: '#047857', marginBottom: 24 }}>Your {bill?.label} payment of <strong>BSD ${fmt(amount)}</strong> has been processed.</div>

                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px', textAlign: 'left', marginBottom: 22 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14 }}>Official Receipt</div>
                  {[
                    { label: 'Reference No.',    value: refNo, mono: true },
                    { label: 'Bill Type',        value: `${bill?.icon} ${bill?.label}` },
                    { label: 'Account No.',      value: accountNo },
                    { label: 'Amount Paid',      value: `BSD $${fmt(amount)}` },
                    { label: `BSC Fee (${BSC_RATE_PCT}%)`, value: `BSD $${fmt(bscFee)}` },
                    { label: 'Service Fee',      value: `BSD $${fmt(serviceFee)}` },
                    { label: 'Total Charged',    value: `BSD $${fmt(total)}`, bold: true },
                    { label: 'Card',             value: `•••• •••• •••• ${last4}` },
                    { label: 'Date',             value: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{row.label}</span>
                      <span style={{ fontSize: 12, color: '#1a2e4a', fontWeight: (row as any).bold ? 900 : 700, fontFamily: (row as any).mono ? 'monospace' : 'inherit' }}>{row.value}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 12, backgroundColor: '#d1fae5', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#065f46', fontWeight: 700, textAlign: 'center' }}>
                    ✅ Approved by RBC · Saved to your history & BSC dashboard
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={reset} style={{ flex: 1, padding: '13px', borderRadius: 12, border: '2px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Pay Another Bill</button>
                  <button className="bsc-btn" onClick={() => router.push('/')} style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', backgroundColor: '#1a2e4a', color: '#f5a623', fontSize: 13, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>Back to Home</button>
                </div>
              </div>
            )}
          </div>

          {view === 'details' && (
            <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
              {BSC_RATE_PCT}% fee + BSD ${fmt(SERVICE_FEE)} service fee per transaction.<br />
              Subscribe for $60/yr to waive all fees.
            </div>
          )}
        </div>
      </div>
    </>
  );
}