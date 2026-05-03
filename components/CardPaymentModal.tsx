'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PaymentPayload {
amount: number;
fees: number;
total: number;
description: string;
receiptType: 'utility' | 'shopping' | 'wholesale' | 'us_shopping';
metadata?: Record<string, unknown>;
orderId?: string;
}

interface Props {
payload: PaymentPayload;
onApproved: (refNo: string, last4: string) => void;
onDeclined: () => void;
onCancel: () => void;
}

interface CardData {
number: string;
name: string;
expiry: string;
cvv: string;
}

type CardStep = 'input' | 'processing' | 'approved' | 'declined';

function fmt(n: number) {
return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ── Card network detection ────────────────────────────────────────────────────
// Visa: starts with 4 (all — credit, debit, prepaid)
// Mastercard: 51-55, 2221-2720 (all — credit, debit, prepaid)
// Discover: 6011, 622126-622925, 644-649, 65
function detectCard(number: string): string | null {
const n = number.replace(/\s/g, '');
if (/^4/.test(n)) return 'VISA';
if (/^5[1-5]/.test(n)) return 'MASTERCARD';
if (/^2(2[2-9][1-9]|[3-6]\d{2}|7[01]\d|720)/.test(n)) return 'MASTERCARD';
if (/^(6011|622|64[4-9]|65)/.test(n)) return 'DISCOVER';
return null;
}

// ── Simulate RBC gateway ──────────────────────────────────────────────────────
// Replace with real RBC_GATEWAY_URL call when keys arrive
async function chargeCard(total: number, last4: string): Promise<{ approved: boolean; refNo: string }> {
await new Promise(r => setTimeout(r, 2800));
// Test: cards ending 0000 = declined (for testing only — remove in production)
const approved = last4 !== '0000';
return { approved, refNo: approved ? `BSC-${Date.now().toString(36).toUpperCase()}` : '' };
}

export default function CardPaymentModal({ payload, onApproved, onDeclined, onCancel }: Props) {
const [step, setStep] = useState<CardStep>('input');
const [card, setCard] = useState<CardData>({ number: '', name: '', expiry: '', cvv: '' });
const [showCvv, setShowCvv] = useState(false);
const [error, setError] = useState('');
const [refNo, setRefNo] = useState('');
const [last4, setLast4] = useState('');

// ── Formatting ──────────────────────────────────────────────────────────────
function handleNumber(raw: string) {
const digits = raw.replace(/\D/g, '').slice(0, 16);
const formatted = digits.replace(/(.{4})/g, '$1 ').trim();
setCard(c => ({ ...c, number: formatted }));
}

function handleExpiry(raw: string) {
const d = raw.replace(/\D/g, '').slice(0, 4);
setCard(c => ({ ...c, expiry: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }));
}

// ── Validation ──────────────────────────────────────────────────────────────
function validate(): string {
const n = card.number.replace(/\s/g, '');
if (n.length < 15) return 'Enter a valid card number.';
if (!card.name.trim()) return 'Enter the name on the card.';
const [mm, yy] = (card.expiry || '/').split('/');
if (!mm || !yy || +mm > 12 || +mm < 1) return 'Enter a valid expiry date (MM/YY).';
if (new Date(2000 + +yy, +mm - 1) < new Date()) return 'This card has expired.';
if (card.cvv.length < 3) return 'Enter a valid CVV.';
// All Visa and Mastercard accepted — no network block
return '';
}

// ── Pay ─────────────────────────────────────────────────────────────────────
async function handlePay() {
const err = validate();
if (err) { setError(err); return; }
setError('');
setStep('processing');

const cardLast4 = card.number.replace(/\s/g, '').slice(-4);
const result = await chargeCard(payload.total, cardLast4);

if (!result.approved) {
setStep('declined');
onDeclined();
return; // ← Nothing saved on decline
}

// ── Save to Supabase on approval only ─────────────────────────────────────
const { data: { session } } = await supabase.auth.getSession();
await supabase.from('payment_receipts').insert({
user_id: session?.user.id || null,
order_id: payload.orderId || null,
receipt_type: payload.receiptType,
amount_bsd: payload.amount,
fees_bsd: payload.fees,
total_bsd: payload.total,
description: payload.description,
reference_no: result.refNo,
payment_method: 'card',
payment_status: 'approved',
card_last4: cardLast4,
metadata: payload.metadata || null,
visible_dashboard: true,
});

if (payload.orderId) {
await supabase.from('orders').update({
payment_status: 'paid',
payment_ref: result.refNo,
payment_method: 'card',
payment_approval: 'approved',
}).eq('id', payload.orderId);
}

setRefNo(result.refNo);
setLast4(cardLast4);
setStep('approved');
onApproved(result.refNo, cardLast4);
}

const ct = detectCard(card.number);

// ── Styles ───────────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
width: '100%', padding: '12px 14px', border: '2px solid #e2e8f0',
borderRadius: 10, fontSize: 14, color: '#1a2e4a', backgroundColor: '#fff',
fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
};
const lbl: React.CSSProperties = {
display: 'block', fontSize: 11, fontWeight: 800, color: '#475569',
letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 7,
};

return (
<>
<style>{`
.bsc-inp:focus { border-color: #1a2e4a !important; box-shadow: 0 0 0 3px rgba(26,46,74,0.12) !important; }
.bsc-inp::placeholder { color: #cbd5e1; }
.bsc-pay-btn { transition: opacity 0.15s, transform 0.15s; }
.bsc-pay-btn:hover { opacity: 0.9; transform: translateY(-1px); }
.bsc-pay-btn:active { transform: translateY(0); }
@keyframes bscSpin { to { transform: rotate(360deg); } }
@keyframes bscPop { from { transform: scale(0.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes bscFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
`}</style>

{/* ── Amount header — always visible ── */}
<div style={{ backgroundColor: '#1a2e4a', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div>
<div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 2 }}>Total Due</div>
<div style={{ color: '#f5a623', fontSize: 26, fontWeight: 900 }}>BSD ${fmt(payload.total)}</div>
</div>
<div style={{ textAlign: 'right', maxWidth: 200 }}>
<div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>{payload.description}</div>
{payload.fees > 0 && (
<div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 3 }}>Incl. BSD ${fmt(payload.fees)} in fees</div>
)}
</div>
</div>

{/* ══════════════ CARD INPUT ══════════════ */}
{step === 'input' && (
<div style={{ animation: 'bscFadeUp 0.35s ease both' }}>

{/* Visual card preview */}
<div style={{ background: 'linear-gradient(135deg, #1a2e4a 0%, #0f2137 55%, #1B4F72 100%)', borderRadius: 16, padding: '22px 26px', marginBottom: 22, boxShadow: '0 8px 28px rgba(26,46,74,0.38)', position: 'relative', overflow: 'hidden', minHeight: 168 }}>
<div style={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: '50%', background: 'rgba(245,166,35,0.07)' }} />
<div style={{ position: 'absolute', bottom: -70, left: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(245,166,35,0.04)' }} />
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28, position: 'relative' }}>
<span style={{ color: '#f5a623', fontWeight: 900, fontSize: 13, letterSpacing: 2 }}>BSC PAY</span>
{ct && (
<span style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 800, fontSize: 12, letterSpacing: 1, backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 10px', borderRadius: 5 }}>{ct}</span>
)}
</div>
<div style={{ color: '#fff', fontSize: 18, fontWeight: 700, letterSpacing: 4, marginBottom: 18, fontFamily: 'monospace', position: 'relative' }}>
{card.number || '•••• •••• •••• ••••'}
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
<div>
<div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>Card Holder</div>
<div style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{card.name || 'YOUR NAME'}</div>
</div>
<div style={{ textAlign: 'right' }}>
<div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>Expires</div>
<div style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{card.expiry || 'MM/YY'}</div>
</div>
</div>
</div>

{/* Card number */}
<div style={{ marginBottom: 14 }}>
<label style={lbl}>Card Number *</label>
<input className="bsc-inp" value={card.number} onChange={e => handleNumber(e.target.value)} placeholder="1234 5678 9012 3456" inputMode="numeric" maxLength={19} style={{ ...inp, fontFamily: 'monospace', fontSize: 16, letterSpacing: 2 }} />
</div>

{/* Name */}
<div style={{ marginBottom: 14 }}>
<label style={lbl}>Name on Card *</label>
<input className="bsc-inp" value={card.name} onChange={e => setCard(c => ({ ...c, name: e.target.value.toUpperCase() }))} placeholder="JOHN SMITH" style={{ ...inp, textTransform: 'uppercase', letterSpacing: 1 }} />
</div>

{/* Expiry + CVV */}
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
<div>
<label style={lbl}>Expiry (MM/YY) *</label>
<input className="bsc-inp" value={card.expiry} onChange={e => handleExpiry(e.target.value)} placeholder="MM/YY" inputMode="numeric" maxLength={5} style={{ ...inp, fontFamily: 'monospace', fontSize: 16, letterSpacing: 2 }} />
</div>
<div>
<label style={lbl}>CVV *</label>
<div style={{ position: 'relative' }}>
<input className="bsc-inp" value={card.cvv} onChange={e => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))} type={showCvv ? 'text' : 'password'} placeholder="•••" inputMode="numeric" maxLength={4} style={{ ...inp, fontFamily: 'monospace', fontSize: 16, letterSpacing: 3, paddingRight: 44 }} />
<button onClick={() => setShowCvv(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>
{showCvv ? '🙈' : '👁️'}
</button>
</div>
</div>
</div>

{/* Error */}
{error && (
<div style={{ backgroundColor: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '11px 15px', marginBottom: 16, fontSize: 13, color: '#991b1b', fontWeight: 600 }}>
⚠️ {error}
</div>
)}

{/* Security badge */}
<div style={{ backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
<span style={{ fontSize: 16 }}>🔒</span>
<span style={{ fontSize: 11, color: '#166534', lineHeight: 1.5 }}>
Encrypted &amp; processed via <strong>RBC Plug &amp; Pay</strong>. BSC never stores your card details.
</span>
</div>

{/* Pay button */}
<button className="bsc-pay-btn" onClick={handlePay} style={{ width: '100%', padding: '15px', borderRadius: 12, border: 'none', backgroundColor: '#1a2e4a', color: '#f5a623', fontSize: 16, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.5, marginBottom: 10 }}>
🔒 Pay Now — BSD ${fmt(payload.total)}
</button>
<button onClick={onCancel} style={{ width: '100%', padding: '12px', borderRadius: 12, border: '2px solid #e2e8f0', backgroundColor: '#fff', color: '#64748b', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
Cancel
</button>

{/* ── Accepted cards — ALL Visa & Mastercard ── */}
<div style={{ marginTop: 18, padding: '14px', backgroundColor: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
<div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 }}>All Cards Accepted</div>
<div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
{[
{ label: 'VISA', color: '#1a1f71', bg: '#e8eaf6' },
{ label: 'VISA DEBIT', color: '#1a1f71', bg: '#e8eaf6' },
{ label: 'VISA PREPAID', color: '#1a1f71', bg: '#e8eaf6' },
{ label: 'MASTERCARD', color: '#eb001b', bg: '#fdecea' },
{ label: 'MASTERCARD DEBIT', color: '#eb001b', bg: '#fdecea' },
{ label: 'MASTERCARD PREPAID', color: '#eb001b', bg: '#fdecea' },
{ label: 'DISCOVER', color: '#e65c00', bg: '#fff3e0' },
].map(c => (
<span key={c.label} style={{ backgroundColor: c.bg, color: c.color, padding: '4px 9px', borderRadius: 5, fontSize: 9, fontWeight: 800, letterSpacing: 0.3 }}>
{c.label}
</span>
))}
</div>
<div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8' }}>
All Visa &amp; Mastercard variants accepted · Debit, Credit &amp; Prepaid
</div>
</div>
</div>
)}

{/* ══════════════ PROCESSING ══════════════ */}
{step === 'processing' && (
<div style={{ textAlign: 'center', padding: '52px 0', animation: 'bscFadeUp 0.3s ease both' }}>
<div style={{ width: 72, height: 72, borderRadius: '50%', border: '5px solid #e2e8f0', borderTopColor: '#1a2e4a', margin: '0 auto 22px', animation: 'bscSpin 0.8s linear infinite' }} />
<div style={{ fontWeight: 900, fontSize: 19, color: '#1a2e4a', marginBottom: 6 }}>Contacting RBC…</div>
<div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>Processing your payment securely</div>
<div style={{ fontSize: 13, color: '#64748b' }}>BSD ${fmt(payload.total)} · Please wait</div>
<div style={{ marginTop: 14, fontSize: 11, color: '#94a3b8' }}>Do not close this window</div>
</div>
)}

{/* ══════════════ APPROVED ══════════════ */}
{step === 'approved' && (
<div style={{ textAlign: 'center', animation: 'bscFadeUp 0.4s ease both' }}>
<div style={{ width: 88, height: 88, borderRadius: '50%', backgroundColor: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, margin: '0 auto 16px', animation: 'bscPop 0.4s ease both' }}>✅</div>
<div style={{ fontWeight: 900, fontSize: 22, color: '#065f46', marginBottom: 4 }}>Payment Approved</div>
<div style={{ fontSize: 13, color: '#047857', marginBottom: 22 }}>Your payment was processed successfully by RBC.</div>

<div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px', textAlign: 'left', marginBottom: 8 }}>
<div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>Receipt</div>
{[
{ label: 'Reference No.', value: refNo, mono: true },
{ label: 'Amount Paid', value: `BSD $${fmt(payload.total)}` },
{ label: 'Card', value: `•••• •••• •••• ${last4}` },
{ label: 'Date', value: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) },
].map(row => (
<div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
<span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{row.label}</span>
<span style={{ fontSize: 12, color: '#1a2e4a', fontWeight: 700, fontFamily: row.mono ? 'monospace' : 'inherit' }}>{row.value}</span>
</div>
))}
<div style={{ marginTop: 12, backgroundColor: '#d1fae5', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#065f46', fontWeight: 700, textAlign: 'center' }}>
✅ Approved by RBC · Saved to your history &amp; BSC dashboard
</div>
</div>
</div>
)}

{/* ══════════════ DECLINED ══════════════ */}
{step === 'declined' && (
<div style={{ textAlign: 'center', animation: 'bscFadeUp 0.4s ease both' }}>
<div style={{ width: 88, height: 88, borderRadius: '50%', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, margin: '0 auto 16px', animation: 'bscPop 0.4s ease both' }}>❌</div>
<div style={{ fontWeight: 900, fontSize: 22, color: '#991b1b', marginBottom: 6 }}>Card Declined</div>
<div style={{ fontSize: 15, color: '#b91c1c', marginBottom: 6, fontWeight: 700 }}>Payment did not go through.</div>
<div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, maxWidth: 320, margin: '0 auto 22px' }}>
Your bank declined this transaction. <strong>No charge was made to your card.</strong>
</div>

<div style={{ backgroundColor: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 12, padding: '14px 18px', marginBottom: 22, textAlign: 'left' }}>
<div style={{ fontSize: 11, fontWeight: 800, color: '#9a3412', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Common Reasons</div>
{[
'Insufficient funds or card limit exceeded',
'Incorrect card number, expiry, or CVV entered',
'Card not activated for online / e-commerce payments',
'Bank security block — contact your bank to allow the transaction',
'Prepaid card balance too low',
].map(r => (
<div key={r} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 7 }}>
<span style={{ color: '#ea580c', fontSize: 13, flexShrink: 0, marginTop: 1 }}>•</span>
<span style={{ fontSize: 12, color: '#7c2d12', lineHeight: 1.4 }}>{r}</span>
</div>
))}
</div>

<div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
<button className="bsc-pay-btn" onClick={() => { setStep('input'); setCard({ number: '', name: '', expiry: '', cvv: '' }); setError(''); }} style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', backgroundColor: '#1a2e4a', color: '#f5a623', fontSize: 14, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
Try Again
</button>
<button onClick={onDeclined} style={{ flex: 1, padding: '13px', borderRadius: 12, border: '2px solid #e2e8f0', backgroundColor: '#fff', color: '#64748b', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
Cancel
</button>
</div>

<div style={{ fontSize: 11, color: '#94a3b8' }}>
Need help? Call BSC: <strong style={{ color: '#1a2e4a' }}>+1 (242) 558-4495</strong>
</div>
</div>
)}
</>
);
}
