'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BASE = 'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

const SERVICE_FEE    = 6.00;
const BSC_RATE_PCT   = 4.5;

const BILL_TYPES = [
  { key: 'bec',      label: 'BEC – Electricity',       icon: '⚡', color: '#f59e0b' },
  { key: 'water',    label: 'WSC – Water & Sewerage',   icon: '💧', color: '#3b82f6' },
  { key: 'aliv',     label: 'Aliv – Mobile',            icon: '📱', color: '#8b5cf6' },
  { key: 'btc',      label: 'BTC – Telephone',          icon: '📞', color: '#10b981' },
  { key: 'internet', label: 'Internet / Cable',         icon: '🌐', color: '#06b6d4' },
  { key: 'cable',    label: 'Cable Bahamas',            icon: '📺', color: '#ef4444' },
  { key: 'nis',      label: 'NIS – National Insurance', icon: '🏛️', color: '#6366f1' },
  { key: 'other',    label: 'Other',                    icon: '📄', color: '#64748b' },
];

type Step = 'details' | 'invoice' | 'card' | 'processing' | 'approved' | 'declined';

interface CardData {
  number:  string;
  name:    string;
  expiry:  string;
  cvv:     string;
}

function fmtMoney(n: number) {
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

  // ── Form state ─────────────────────────────────────────────────────────────
  const [step, setStep]           = useState<Step>('details');
  const [billType, setBillType]   = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [accountName, setAccountName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [card, setCard]           = useState<CardData>({ number: '', name: '', expiry: '', cvv: '' });
  const [cardError, setCardError] = useState('');
  const [refNo, setRefNo]         = useState('');
  const [showCvv, setShowCvv]     = useState(false);
  const amountInputRef            = useRef<HTMLInputElement>(null);

  const amount  = parseFloat(amountStr.replace(/,/g, '')) || 0;
  const { bscFee, serviceFee, total } = calcFees(amount);
  const billConfig = BILL_TYPES.find(b => b.key === billType);

  // ── Card formatting ─────────────────────────────────────────────────────────
  function handleCardNumber(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 16);
    const formatted = digits.replace(/(.{4})/g, '$1 ').trim();
    setCard(c => ({ ...c, number: formatted }));
  }

  function handleExpiry(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    const formatted = digits.length > 2 ? `${digits.slice(0,2)}/${digits.slice(2)}` : digits;
    setCard(c => ({ ...c, expiry: formatted }));
  }

  function handleAmount(raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '');
    setAmountStr(clean);
  }

  // ── Card type detection ──────────────────────────────────────────────────────
  function cardType() {
    const n = card.number.replace(/\s/g, '');
    if (n.startsWith('4'))                   return { label: 'VISA',       icon: '💳' };
    if (/^5[1-5]/.test(n))                   return { label: 'MASTERCARD', icon: '💳' };
    if (/^3[47]/.test(n))                    return { label: 'AMEX',       icon: '💳' };
    if (n.startsWith('6011'))                return { label: 'DISCOVER',   icon: '💳' };
    return null;
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  function canProceedToInvoice() {
    return billType && accountNo.trim() && amount >= 1;
  }

  function validateCard() {
    const n = card.number.replace(/\s/g, '');
    if (n.length < 16)      return 'Please enter a valid 16-digit card number.';
    if (!card.name.trim())  return 'Please enter the name on the card.';
    const [mm, yy] = card.expiry.split('/');
    if (!mm || !yy || parseInt(mm) > 12 || parseInt(mm) < 1) return 'Please enter a valid expiry date (MM/YY).';
    const now = new Date();
    const exp = new Date(2000 + parseInt(yy), parseInt(mm) - 1);
    if (exp < now)          return 'This card has expired.';
    if (card.cvv.length < 3) return 'Please enter a valid CVV.';
    return '';
  }

  // ── Pay Now ─────────────────────────────────────────────────────────────────
  async function handlePayNow() {
    const err = validateCard();
    if (err) { setCardError(err); return; }
    setCardError('');
    setStep('processing');

    // Simulate RBC gateway call (replace with real RBC_GATEWAY_URL when keys arrive)
    await new Promise(r => setTimeout(r, 2800));

    // Generate reference
    const ref = `BSC-${Date.now().toString(36).toUpperCase()}`;
    setRefNo(ref);

    // Save to Supabase
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('utility_payments').insert({
      bill_type:    billType,
      account_no:   accountNo,
      account_name: accountName || null,
      amount_bsd:   amount,
      bsc_fee:      bscFee,
      service_fee:  serviceFee,
      total_bsd:    total,
      payment_method: 'card',
      payment_status: 'approved',
      reference_no:   ref,
      user_id:        session?.user.id || null,
    });

    setStep('approved');
  }

  // ── Step: Payment Details ────────────────────────────────────────────────────
  const StepDetails = () => (
    <div style={{ animation: 'fadeUp 0.4s ease both' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>Select Bill Type</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {BILL_TYPES.map(b => (
            <button
              key={b.key}
              onClick={() => setBillType(b.key)}
              style={{
                padding: '12px 14px', borderRadius: 10, border: billType === b.key ? `2px solid ${b.color}` : '2px solid #e2e8f0',
                backgroundColor: billType === b.key ? `${b.color}12` : '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                transition: 'all 0.18s', fontFamily: 'inherit',
                boxShadow: billType === b.key ? `0 0 0 4px ${b.color}18` : 'none',
              }}
            >
              <span style={{ fontSize: 20 }}>{b.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: billType === b.key ? b.color : '#475569', textAlign: 'left', lineHeight: 1.3 }}>{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div>
          <label style={labelStyle}>Account Number *</label>
          <input
            value={accountNo}
            onChange={e => setAccountNo(e.target.value)}
            placeholder="e.g. 123456789"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Account Holder Name</label>
          <input
            value={accountName}
            onChange={e => setAccountName(e.target.value)}
            placeholder="Optional"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Amount */}
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Payment Amount (BSD) *</label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, fontWeight: 700, color: '#1a2e4a' }}>$</span>
          <input
            ref={amountInputRef}
            value={amountStr}
            onChange={e => handleAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            style={{ ...inputStyle, paddingLeft: 30, fontSize: 24, fontWeight: 800, color: '#1a2e4a', letterSpacing: 0.5 }}
          />
        </div>
      </div>

      {/* Live fee preview */}
      {amount >= 1 && (
        <div style={{ backgroundColor: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', marginBottom: 24, animation: 'fadeUp 0.3s ease both' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>Fee Preview</div>
          <FeeRow label="Payment Amount" value={amount} />
          <FeeRow label={`Cost of Doing Business (${BSC_RATE_PCT}%)`} value={bscFee} sub />
          <FeeRow label="Service Fee" value={serviceFee} sub />
          <div style={{ borderTop: '2px solid #e2e8f0', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 900, fontSize: 15, color: '#1a2e4a' }}>Total Due</span>
            <span style={{ fontWeight: 900, fontSize: 22, color: '#1a2e4a' }}>BSD ${fmtMoney(total)}</span>
          </div>
        </div>
      )}

      <button
        onClick={() => setStep('invoice')}
        disabled={!canProceedToInvoice()}
        style={{ ...primaryBtn, opacity: canProceedToInvoice() ? 1 : 0.4, cursor: canProceedToInvoice() ? 'pointer' : 'not-allowed' }}
      >
        Review Invoice →
      </button>
    </div>
  );

  // ── Step: Invoice ────────────────────────────────────────────────────────────
  const StepInvoice = () => (
    <div style={{ animation: 'fadeUp 0.4s ease both' }}>

      {/* Invoice document */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', marginBottom: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>

        {/* Invoice header */}
        <div style={{ backgroundColor: '#1a2e4a', padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ color: '#f5a623', fontWeight: 900, fontSize: 18, letterSpacing: 1, marginBottom: 2 }}>BSC MARKETPLACE</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Nassau, Bahamas 🇧🇸</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>bscbahamas.com</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#f5a623', fontWeight: 900, fontSize: 22, letterSpacing: 2 }}>INVOICE</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 2 }}>Bill Payment Service</div>
            </div>
          </div>
        </div>

        {/* Bill details */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafbfc' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Bill To</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2e4a' }}>{accountName || 'Account Holder'}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Account No: {accountNo}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Bill Type</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2e4a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{billConfig?.icon}</span>
                <span>{billConfig?.label}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div style={{ padding: '0 28px' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, padding: '14px 0 10px', borderBottom: '2px solid #1a2e4a' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#1a2e4a', letterSpacing: 1, textTransform: 'uppercase' }}>Description</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#1a2e4a', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'right' }}>Amount (BSD)</span>
          </div>

          {/* Line 1 — Payment amount */}
          <InvoiceLine
            label={`${billConfig?.label} — Payment`}
            sub={`Account: ${accountNo}`}
            amount={amount}
            color="#1a2e4a"
          />

          {/* Line 2 — 4.5% fee */}
          <InvoiceLine
            label={`Cost of Doing Business — ${BSC_RATE_PCT}%`}
            sub={`${BSC_RATE_PCT}% × BSD $${fmtMoney(amount)}`}
            amount={bscFee}
            color="#64748b"
            small
          />

          {/* Line 3 — $6 service fee */}
          <InvoiceLine
            label="Service Fee — BSC Bill Payment"
            sub="Flat rate per transaction"
            amount={serviceFee}
            color="#64748b"
            small
          />

          {/* Subtotal spacer */}
          <div style={{ borderTop: '1px dashed #e2e8f0', margin: '4px 0' }} />

          {/* Total */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, padding: '16px 0', borderTop: '3px solid #1a2e4a', marginTop: 4 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16, color: '#1a2e4a' }}>TOTAL DUE</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Payment Amount + Fees</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 900, fontSize: 26, color: '#1a2e4a' }}>BSD ${fmtMoney(total)}</div>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div style={{ backgroundColor: '#fff8e7', borderTop: '1px solid #fde68a', padding: '12px 28px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
          <div style={{ fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>
            Fees cover BSC's cost of processing and delivering your payment to <strong>{billConfig?.label}</strong>. Payments are processed securely via RBC Plug & Pay. Your bill provider receives the exact payment amount of BSD ${fmtMoney(amount)}.
          </div>
        </div>
      </div>

      {/* Only card payment — no wire transfer */}
      <div style={{ backgroundColor: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 22 }}>💳</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#0c4a6e' }}>Card Payment Only</div>
          <div style={{ fontSize: 12, color: '#075985' }}>BSC accepts card payments for bill services. No wire transfers.</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => setStep('details')} style={{ ...ghostBtn, flex: '0 0 auto' }}>← Back</button>
        <button onClick={() => setStep('card')} style={{ ...primaryBtn, flex: 1 }}>
          Continue to Pay via Card →
        </button>
      </div>
    </div>
  );

  // ── Step: Card Input ─────────────────────────────────────────────────────────
  const StepCard = () => {
    const ct = cardType();
    return (
      <div style={{ animation: 'fadeUp 0.4s ease both' }}>

        {/* Amount reminder */}
        <div style={{ backgroundColor: '#1a2e4a', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Total Due</div>
            <div style={{ color: '#f5a623', fontSize: 26, fontWeight: 900 }}>BSD ${fmtMoney(total)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{billConfig?.icon} {billConfig?.label}</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Acct: {accountNo}</div>
          </div>
        </div>

        {/* Visual card */}
        <div style={{
          background: 'linear-gradient(135deg, #1a2e4a 0%, #0f2137 60%, #1B4F72 100%)',
          borderRadius: 16, padding: '24px 28px', marginBottom: 24,
          boxShadow: '0 8px 32px rgba(26,46,74,0.4)',
          position: 'relative', overflow: 'hidden', minHeight: 180,
        }}>
          {/* Card shimmer */}
          <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(245,166,35,0.08)' }} />
          <div style={{ position: 'absolute', bottom: -60, left: -30, width: 180, height: 180, borderRadius: '50%', background: 'rgba(245,166,35,0.05)' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, position: 'relative' }}>
            <div style={{ color: '#f5a623', fontWeight: 900, fontSize: 14, letterSpacing: 2 }}>BSC PAY</div>
            {ct && <div style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 800, fontSize: 12, letterSpacing: 1 }}>{ct.label}</div>}
          </div>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, letterSpacing: 4, marginBottom: 20, fontFamily: 'monospace', position: 'relative' }}>
            {(card.number || '•••• •••• •••• ••••').padEnd(19, '•')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>Card Holder</div>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>{card.name || 'YOUR NAME'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>Expires</div>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>{card.expiry || 'MM/YY'}</div>
            </div>
          </div>
        </div>

        {/* Card fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          <div>
            <label style={labelStyle}>Card Number *</label>
            <input
              value={card.number}
              onChange={e => handleCardNumber(e.target.value)}
              placeholder="1234 5678 9012 3456"
              inputMode="numeric"
              maxLength={19}
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 16, letterSpacing: 2 }}
            />
          </div>

          <div>
            <label style={labelStyle}>Name on Card *</label>
            <input
              value={card.name}
              onChange={e => setCard(c => ({ ...c, name: e.target.value.toUpperCase() }))}
              placeholder="JOHN SMITH"
              style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: 1 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Expiry Date *</label>
              <input
                value={card.expiry}
                onChange={e => handleExpiry(e.target.value)}
                placeholder="MM/YY"
                inputMode="numeric"
                maxLength={5}
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 16, letterSpacing: 2 }}
              />
            </div>
            <div>
              <label style={labelStyle}>CVV *</label>
              <div style={{ position: 'relative' }}>
                <input
                  value={card.cvv}
                  onChange={e => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="•••"
                  type={showCvv ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 16, letterSpacing: 3, paddingRight: 44 }}
                />
                <button
                  onClick={() => setShowCvv(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
                >
                  {showCvv ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Security notice */}
        <div style={{ backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 18 }}>🔒</span>
          <div style={{ fontSize: 11, color: '#166534', lineHeight: 1.5 }}>
            Your card details are encrypted and processed securely via <strong>RBC Plug & Pay</strong>. BSC does not store your card number, CVV, or expiry date.
          </div>
        </div>

        {cardError && (
          <div style={{ backgroundColor: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#991b1b', fontWeight: 600 }}>
            ⚠️ {cardError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setStep('invoice')} style={{ ...ghostBtn, flex: '0 0 auto' }}>← Invoice</button>
          <button onClick={handlePayNow} style={{ ...primaryBtn, flex: 1, fontSize: 16, padding: '16px' }}>
            🔒 Pay Now — BSD ${fmtMoney(total)}
          </button>
        </div>

        {/* Accepted cards */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Accepted:</span>
          {['VISA', 'MASTERCARD', 'DISCOVER'].map(c => (
            <span key={c} style={{ backgroundColor: '#f1f5f9', padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 800, color: '#475569', letterSpacing: 0.5 }}>{c}</span>
          ))}
        </div>
      </div>
    );
  };

  // ── Step: Processing ─────────────────────────────────────────────────────────
  const StepProcessing = () => (
    <div style={{ textAlign: 'center', padding: '60px 0', animation: 'fadeUp 0.4s ease both' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', border: '5px solid #e2e8f0', borderTopColor: '#1a2e4a', margin: '0 auto 24px', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontWeight: 900, fontSize: 20, color: '#1a2e4a', marginBottom: 8 }}>Processing Payment…</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>Contacting RBC Plug & Pay</div>
      <div style={{ fontSize: 13, color: '#64748b' }}>BSD ${fmtMoney(total)} · {billConfig?.label}</div>
    </div>
  );

  // ── Step: Approved ───────────────────────────────────────────────────────────
  const StepApproved = () => (
    <div style={{ textAlign: 'center', animation: 'fadeUp 0.5s ease both' }}>
      <div style={{ width: 90, height: 90, borderRadius: '50%', backgroundColor: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, margin: '0 auto 20px' }}>✅</div>
      <div style={{ fontWeight: 900, fontSize: 24, color: '#065f46', marginBottom: 6 }}>Payment Approved!</div>
      <div style={{ fontSize: 14, color: '#047857', marginBottom: 24 }}>Your {billConfig?.label} payment has been processed.</div>

      {/* Receipt summary */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #d1fae5', borderRadius: 16, padding: '24px', marginBottom: 24, textAlign: 'left', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>Receipt</div>
        <ReceiptRow label="Reference No."     value={refNo} mono />
        <ReceiptRow label="Bill Type"         value={`${billConfig?.icon} ${billConfig?.label}`} />
        <ReceiptRow label="Account No."       value={accountNo} />
        <ReceiptRow label="Payment Amount"    value={`BSD $${fmtMoney(amount)}`} />
        <ReceiptRow label="BSC Fee (4.5%)"    value={`BSD $${fmtMoney(bscFee)}`} light />
        <ReceiptRow label="Service Fee"       value={`BSD $${fmtMoney(serviceFee)}`} light />
        <div style={{ borderTop: '2px solid #1a2e4a', marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#1a2e4a' }}>Total Charged</span>
          <span style={{ fontWeight: 900, fontSize: 18, color: '#1a2e4a' }}>BSD ${fmtMoney(total)}</span>
        </div>
        <div style={{ marginTop: 12, padding: '10px 14px', backgroundColor: '#f0fdf4', borderRadius: 8, fontSize: 11, color: '#166534', textAlign: 'center', fontWeight: 600 }}>
          {new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })} · Card Payment · RBC Approved
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => { setStep('details'); setBillType(''); setAccountNo(''); setAccountName(''); setAmountStr(''); setCard({ number: '', name: '', expiry: '', cvv: '' }); }} style={{ ...ghostBtn, flex: 1 }}>Pay Another Bill</button>
        <button onClick={() => router.push('/')} style={{ ...primaryBtn, flex: 1 }}>Back to Home</button>
      </div>
    </div>
  );

  // ── Progress bar ─────────────────────────────────────────────────────────────
  const STEPS = [
    { key: 'details',    label: 'Details'  },
    { key: 'invoice',    label: 'Invoice'  },
    { key: 'card',       label: 'Payment'  },
    { key: 'processing', label: 'Process'  },
    { key: 'approved',   label: 'Done'     },
  ];
  const stepIndex = STEPS.findIndex(s => s.key === step);

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus { border-color: #1a2e4a !important; box-shadow: 0 0 0 3px rgba(26,46,74,0.12); outline: none; }
        input::placeholder { color: #cbd5e1; }
      `}</style>

      <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>

        {/* ── Nav ── */}
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
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600 }}>Secured by RBC</span>
            </div>
          </div>
        </nav>

        <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px 60px' }}>

          {/* ── Progress steps ── */}
          {step !== 'processing' && step !== 'approved' && (
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
              {STEPS.slice(0, 3).map((s, i) => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: i < stepIndex ? '#22c55e' : i === stepIndex ? '#1a2e4a' : '#e2e8f0',
                      color: i <= stepIndex ? '#fff' : '#94a3b8',
                      fontWeight: 800, fontSize: 13, flexShrink: 0,
                      transition: 'all 0.3s',
                    }}>
                      {i < stepIndex ? '✓' : i + 1}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: i === stepIndex ? '#1a2e4a' : '#94a3b8', whiteSpace: 'nowrap' }}>{s.label}</span>
                  </div>
                  {i < 2 && <div style={{ flex: 1, height: 2, backgroundColor: i < stepIndex ? '#22c55e' : '#e2e8f0', margin: '0 10px', transition: 'background 0.3s' }} />}
                </div>
              ))}
            </div>
          )}

          {/* ── Main card ── */}
          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: '32px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
            {step === 'details'    && <><PageTitle title="Bill Payment" sub="Enter your payment details below" /><StepDetails /></>}
            {step === 'invoice'    && <><PageTitle title="Review Invoice" sub="Confirm the details before paying" /><StepInvoice /></>}
            {step === 'card'       && <><PageTitle title="Card Payment" sub="Enter your card details to complete payment" /><StepCard /></>}
            {step === 'processing' && <StepProcessing />}
            {step === 'approved'   && <StepApproved />}
          </div>

          {/* ── BSC note ── */}
          {step === 'details' && (
            <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
              A {BSC_RATE_PCT}% fee + BSD ${SERVICE_FEE.toFixed(2)} service fee applies to each transaction.<br />
              Subscribe for $60/yr to waive all fees on every payment.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Small reusable components ─────────────────────────────────────────────────
function PageTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#1a2e4a', marginBottom: 4 }}>{title}</h1>
      <p style={{ fontSize: 13, color: '#64748b' }}>{sub}</p>
    </div>
  );
}

function FeeRow({ label, value, sub, color }: { label: string; value: number; sub?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: sub ? 12 : 14, color: sub ? '#64748b' : '#1a2e4a', fontWeight: sub ? 500 : 700 }}>{label}</span>
      <span style={{ fontSize: sub ? 12 : 14, color: color || (sub ? '#64748b' : '#1a2e4a'), fontWeight: 700 }}>
        {sub ? '+' : ''}BSD ${fmtMoney(value)}
      </span>
    </div>
  );
}

function InvoiceLine({ label, sub, amount, color, small }: { label: string; sub: string; amount: number; color: string; small?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, padding: '14px 0', borderBottom: '1px solid #f8fafc', alignItems: 'center' }}>
      <div>
        <div style={{ fontWeight: small ? 600 : 700, fontSize: small ? 13 : 14, color }}>{label}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ fontWeight: 800, fontSize: small ? 13 : 15, color, textAlign: 'right' }}>
        BSD ${fmtMoney(amount)}
      </div>
    </div>
  );
}

function ReceiptRow({ label, value, mono, light }: { label: string; value: string; mono?: boolean; light?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ fontSize: 12, color: light ? '#94a3b8' : '#64748b', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: light ? '#94a3b8' : '#1a2e4a', fontFamily: mono ? 'monospace' : 'inherit', letterSpacing: mono ? 0.5 : 0 }}>{value}</span>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 800, color: '#475569',
  letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px',
  border: '2px solid #e2e8f0', borderRadius: 10,
  fontSize: 14, color: '#1a2e4a', backgroundColor: '#fff',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '14px', borderRadius: 12, border: 'none',
  backgroundColor: '#1a2e4a', color: '#f5a623',
  fontSize: 15, fontWeight: 900, cursor: 'pointer',
  letterSpacing: 0.5, transition: 'opacity 0.15s, transform 0.15s',
  fontFamily: 'inherit',
};

const ghostBtn: React.CSSProperties = {
  padding: '14px 20px', borderRadius: 12,
  border: '2px solid #e2e8f0', backgroundColor: '#fff',
  color: '#475569', fontSize: 14, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
  transition: 'all 0.15s',
};