// File: app/utilities/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
'https://auqjjrisivhfmpleusyt.supabase.co',
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg'
);

const SERVICE_FEE_RATE = 0.045; // 4.5% to cover banking fees
const SUBSCRIPTION_PRICE = 60; // $60/year
const BSC_WHATSAPP = '12423613474';

const UTILITIES = [
{ id: 'bec', name: 'BEC', fullName: 'Bahamas Electricity Corporation', icon: '⚡', color: '#f5c518', description: 'Electric bill payment' },
{ id: 'water', name: 'Water Authority', fullName: 'Water & Sewerage Authority', icon: '💧', color: '#60a5fa', description: 'Water & sewerage bill' },
{ id: 'cable', name: 'Cable Bahamas', fullName: 'Cable Bahamas', icon: '📺', color: '#a78bfa', description: 'Cable & internet bill' },
{ id: 'aliv', name: 'Aliv', fullName: 'Aliv Mobile', icon: '📱', color: '#4ade80', description: 'Aliv mobile top-up & bill' },
{ id: 'btc', name: 'BTC', fullName: 'Bahamas Telecommunications', icon: '📞', color: '#60a5fa', description: 'BTC landline & internet' },
{ id: 'flow', name: 'Flow / Internet', fullName: 'Flow & Internet Providers', icon: '🌐', color: '#f87171', description: 'Flow mobile & broadband' },
];

type Screen = 'home' | 'pay' | 'subscription' | 'confirm' | 'receipt' | 'admin';
type PaymentMethod = 'cash' | 'card';

type UtilityPayment = {
id: string;
customer_name: string;
customer_phone: string;
utility_company: string;
account_number: string;
amount_to_pay: number;
service_fee: number;
total_charged: number;
payment_method: string;
payment_status: string;
reference_number: string;
is_subscriber: boolean;
processed_by: string;
created_at: string;
notes: string;
};

type Subscription = {
id: string;
customer_name: string;
customer_phone: string;
status: string;
start_date: string;
end_date: string;
amount_paid: number;
};

function generateRef(): string {
return 'BSC-' + Date.now().toString().slice(-8).toUpperCase();
}

export default function UtilitiesPage() {
const router = useRouter();
const [screen, setScreen] = useState<Screen>('home');
const [isAdmin, setIsAdmin] = useState(false);
const [isControlAdmin, setIsControlAdmin] = useState(false);
const [loading, setLoading] = useState(false);
const [success, setSuccess] = useState('');
const [error, setError] = useState('');

// Payment form state
const [selectedUtility, setSelectedUtility] = useState(UTILITIES[0]);
const [customerName, setCustomerName] = useState('');
const [customerPhone, setCustomerPhone] = useState('');
const [accountNumber, setAccountNumber] = useState('');
const [amountToPay, setAmountToPay] = useState('');
const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
const [isSubscriber, setIsSubscriber] = useState(false);
const [referenceNumber, setReferenceNumber] = useState('');
const [completedPayment, setCompletedPayment] = useState<any>(null);

// Subscription form
const [subName, setSubName] = useState('');
const [subPhone, setSubPhone] = useState('');
const [subEmail, setSubEmail] = useState('');
const [subPayMethod, setSubPayMethod] = useState<PaymentMethod>('cash');

// Admin state
const [adminPayments, setAdminPayments] = useState<UtilityPayment[]>([]);
const [adminSubs, setAdminSubs] = useState<Subscription[]>([]);
const [adminTab, setAdminTab] = useState<'payments' | 'subscriptions'>('payments');
const [adminLoading, setAdminLoading] = useState(false);

const billAmount = parseFloat(amountToPay) || 0;
const serviceFee = isSubscriber ? 0 : parseFloat((billAmount * SERVICE_FEE_RATE).toFixed(2));
const totalCharged = parseFloat((billAmount + serviceFee).toFixed(2));
const savingsVsPerTransaction = isSubscriber ? 0 : billAmount * SERVICE_FEE_RATE;

useEffect(() => {
checkAuth();
}, []);

async function checkAuth() {
const { data: { session } } = await supabase.auth.getSession();
const user = session?.user;
if (user) {
const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
if (profile?.role === 'control_admin' || profile?.role === 'basic_admin' || profile?.role === 'manager') {
setIsAdmin(true);
if (profile.role === 'control_admin') setIsControlAdmin(true);
}
}
}

async function checkSubscriberStatus(phone: string) {
if (!phone || phone.length < 7) return;
const { data } = await supabase
.from('utility_subscriptions')
.select('*')
.eq('customer_phone', phone.replace(/\D/g, ''))
.eq('status', 'active')
.single();
setIsSubscriber(!!data);
}

async function handleSubmitPayment() {
setError('');
if (!customerName.trim()) { setError('Customer name required'); return; }
if (!customerPhone.trim()) { setError('Phone number required'); return; }
if (!accountNumber.trim()) { setError('Account number required'); return; }
if (!amountToPay || billAmount <= 0) { setError('Enter the bill amount'); return; }
setLoading(true);
const ref = generateRef();
setReferenceNumber(ref);
const payload = {
customer_name: customerName,
customer_phone: customerPhone.replace(/\D/g, ''),
utility_company: selectedUtility.fullName,
account_number: accountNumber,
amount_to_pay: billAmount,
service_fee: serviceFee,
total_charged: totalCharged,
payment_method: paymentMethod,
payment_status: paymentMethod === 'cash' ? 'pending_cash' : 'pending_card',
reference_number: ref,
is_subscriber: isSubscriber,
processed_by: isAdmin ? 'BSC Staff' : 'Online',
notes: '',
};
const { data, error: insertErr } = await supabase.from('utility_payments').insert(payload).select().single();
setLoading(false);
if (insertErr) { setError(insertErr.message); return; }
setCompletedPayment({ ...payload, id: data?.id });
setScreen('receipt');
}

async function handleMarkProcessed(id: string) {
await supabase.from('utility_payments').update({ payment_status: 'completed', processed_by: 'BSC Staff', processed_at: new Date().toISOString() }).eq('id', id);
await loadAdminData();
}

async function handleMarkFailed(id: string) {
await supabase.from('utility_payments').update({ payment_status: 'failed' }).eq('id', id);
await loadAdminData();
}

async function handleCreateSubscription() {
setError('');
if (!subName || !subPhone) { setError('Name and phone required'); return; }
setLoading(true);
const start = new Date();
const end = new Date();
end.setFullYear(end.getFullYear() + 1);
const { error: err } = await supabase.from('utility_subscriptions').insert({
customer_name: subName,
customer_phone: subPhone.replace(/\D/g, ''),
customer_email: subEmail,
plan: 'yearly',
amount_paid: SUBSCRIPTION_PRICE,
start_date: start.toISOString(),
end_date: end.toISOString(),
status: 'active',
payment_method: subPayMethod,
});
setLoading(false);
if (err) { setError(err.message); return; }
setSuccess('✅ Subscription activated! No service fee for 1 year.');
setTimeout(() => { setSuccess(''); setScreen('home'); }, 3000);
}

async function loadAdminData() {
setAdminLoading(true);
const { data: payments } = await supabase.from('utility_payments').select('*').order('created_at', { ascending: false }).limit(100);
if (payments) setAdminPayments(payments);
const { data: subs } = await supabase.from('utility_subscriptions').select('*').order('created_at', { ascending: false });
if (subs) setAdminSubs(subs);
setAdminLoading(false);
}

function sendWhatsAppReceipt(payment: any) {
const phone = payment.customer_phone?.replace(/\D/g, '');
const raw = phone?.startsWith('1') ? phone : '1242' + phone;
const text =
`*BSC MARKETPLACE — BILL PAYMENT RECEIPT* 🧾\n\n` +
`Reference: ${payment.reference_number}\n` +
`Date: ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}\n\n` +
`Customer: ${payment.customer_name}\n` +
`Utility: ${payment.utility_company}\n` +
`Account #: ${payment.account_number}\n\n` +
`Bill Amount: $${payment.amount_to_pay?.toFixed(2)}\n` +
`Service Fee: $${payment.service_fee?.toFixed(2)}${payment.is_subscriber ? ' (Subscriber — FREE)' : ' (4.5%)'}\n` +
`*TOTAL PAID: $${payment.total_charged?.toFixed(2)}*\n\n` +
`Payment Method: ${payment.payment_method === 'cash' ? 'Cash in Store' : 'Card'}\n` +
`Status: ${payment.payment_status === 'pending_cash' ? 'Awaiting Cash Payment at BSC' : 'Processing'}\n\n` +
`${payment.payment_method === 'cash' ? '⚠️ Please bring this reference number to BSC Marketplace to complete your cash payment.\n\n' : ''}` +
`Thank you for using BSC Bill Pay! 🇧🇸\n` +
`BSC Marketplace · Firetrial Road, Nassau`;
window.open(`https://api.whatsapp.com/send?phone=${raw}&text=${encodeURIComponent(text)}`, '_blank');
}

function printReceipt(payment: any) {
const html = `<!DOCTYPE html><html><head><title>BSC Bill Payment Receipt</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;padding:20px;color:#000;background:#fff;max-width:380px;margin:0 auto}
.logo{text-align:center;border-bottom:2px dashed #000;padding-bottom:12px;margin-bottom:12px}
.biz{font-size:1.2em;font-weight:bold}.sub{font-size:0.75em;color:#444;margin-top:3px}
.row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #ccc;font-size:0.85em}
.total{display:flex;justify-content:space-between;padding:10px 0;font-size:1.1em;font-weight:bold;border-top:2px solid #000;margin-top:8px}
.ref{text-align:center;margin:12px 0;font-size:0.7em;color:#666}
.footer{text-align:center;font-size:0.7em;color:#666;margin-top:12px;border-top:1px dashed #ccc;padding-top:10px}
.warn{background:#fff3cd;border:1px solid #f5c518;border-radius:6px;padding:8px;margin:10px 0;font-size:0.8em;text-align:center}
</style></head><body>
<div class="logo"><div class="biz">BSC MARKETPLACE</div><div class="sub">Bill Payment Service</div><div class="sub">Firetrial Road, Nassau, Bahamas</div></div>
<div class="row"><span>Reference</span><span>${payment.reference_number}</span></div>
<div class="row"><span>Date</span><span>${new Date().toLocaleDateString()}</span></div>
<div class="row"><span>Customer</span><span>${payment.customer_name}</span></div>
<div class="row"><span>Phone</span><span>${payment.customer_phone}</span></div>
<div class="row"><span>Utility</span><span>${payment.utility_company}</span></div>
<div class="row"><span>Account #</span><span>${payment.account_number}</span></div>
<div class="row"><span>Bill Amount</span><span>$${parseFloat(payment.amount_to_pay).toFixed(2)}</span></div>
<div class="row"><span>Service Fee (4.5%)</span><span>$${parseFloat(payment.service_fee).toFixed(2)}${payment.is_subscriber ? ' (FREE)' : ''}</span></div>
<div class="total"><span>TOTAL CHARGED</span><span>$${parseFloat(payment.total_charged).toFixed(2)}</span></div>
<div class="row"><span>Payment</span><span>${payment.payment_method === 'cash' ? 'Cash' : 'Card'}</span></div>
${payment.payment_method === 'cash' ? '<div class="warn">⚠️ Bring this receipt to BSC Marketplace to complete your cash payment</div>' : ''}
<div class="ref">${payment.reference_number}</div>
<div class="footer"><div>BSC Marketplace acts as a bill payment agent only.</div><div>Your payment is forwarded to the utility within 1 business day.</div><div>BSC is not affiliated with any utility company.</div><div style="margin-top:6px">© 2025 BSC Marketplace · Owned by Dedrick Storr Snr & Family</div></div>
</body></html>`;
const w = window.open('', '_blank', 'width=500,height=700');
if (!w) return;
w.document.write(html);
w.document.close();
w.focus();
setTimeout(() => { w.print(); w.close(); }, 400);
}

// ── STYLES ──
const pg: React.CSSProperties = { backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: "'Inter', sans-serif", paddingBottom: 40 };
const card: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 16, padding: '16px 18px', border: '1px solid #1e3a5f', marginBottom: 14 };
const inp: React.CSSProperties = { display: 'block', width: '100%', padding: '12px 13px', borderRadius: 10, backgroundColor: '#060d1f', color: '#fff', border: '1px solid #1e3a5f', fontSize: 15, marginBottom: 12, boxSizing: 'border-box' as const, outline: 'none' };
const lbl: React.CSSProperties = { display: 'block', color: '#6b7280', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 5 };
const primaryBtn: React.CSSProperties = { width: '100%', padding: '14px', borderRadius: 12, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', fontSize: 15, cursor: 'pointer', marginBottom: 10 };
const ghostBtn: React.CSSProperties = { width: '100%', padding: '12px', borderRadius: 12, backgroundColor: 'transparent', color: '#6b7280', border: '1px solid #1e3a5f', fontSize: 14, cursor: 'pointer', marginBottom: 10 };

const Header = ({ title, subtitle, back }: { title: string; subtitle?: string; back?: () => void }) => (
<div style={{ background: 'linear-gradient(135deg, #070e1d, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '14px 18px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
<div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
{back && <button onClick={back} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 22, cursor: 'pointer', padding: 0 }}>←</button>}
<div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>{title}</p>
{subtitle && <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{subtitle}</p>}
</div>
</div>
<div style={{ display: 'flex', gap: 8 }}>
{isAdmin && screen !== 'admin' && (
<button onClick={() => { setScreen('admin'); loadAdminData(); }} style={{ background: 'none', border: '1px solid #1e3a5f', color: '#6b7280', fontSize: 11, cursor: 'pointer', padding: '5px 10px', borderRadius: 8 }}>Admin</button>
)}
{isControlAdmin && (
<button onClick={() => router.push('/')} style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '1px solid #f5c518', borderRadius: 10, color: '#f5c518', fontWeight: 'bold', fontSize: 11, cursor: 'pointer', padding: '6px 12px' }}>← BSC Control</button>
)}
</div>
</div>
</div>
);

// ── RECEIPT SCREEN ──
if (screen === 'receipt' && completedPayment) return (
<div style={pg}>
<Header title="⚡ BSC Bill Pay" subtitle="Payment Submitted" back={() => { setScreen('home'); setCompletedPayment(null); setCustomerName(''); setCustomerPhone(''); setAccountNumber(''); setAmountToPay(''); }} />
<div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 18px' }}>
<div style={{ textAlign: 'center', marginBottom: 24 }}>
<div style={{ fontSize: 64, marginBottom: 12 }}>✅</div>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 22 }}>Payment Submitted!</p>
<p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 13 }}>Reference: <span style={{ color: '#f5c518', fontFamily: 'monospace', fontWeight: 'bold' }}>{completedPayment.reference_number}</span></p>
</div>

{/* RECEIPT CARD */}
<div style={{ backgroundColor: '#fff', color: '#111', borderRadius: 16, padding: 20, marginBottom: 16, fontFamily: 'monospace' }}>
<div style={{ textAlign: 'center', borderBottom: '1px dashed #ccc', paddingBottom: 12, marginBottom: 12 }}>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>BSC MARKETPLACE</p>
<p style={{ margin: '2px 0', fontSize: 11, color: '#666' }}>Bill Payment Service</p>
<p style={{ margin: '2px 0', fontSize: 11, color: '#666' }}>Firetrial Road, Nassau, Bahamas</p>
</div>
{[
{ label: 'Reference', value: completedPayment.reference_number },
{ label: 'Customer', value: completedPayment.customer_name },
{ label: 'Phone', value: completedPayment.customer_phone },
{ label: 'Utility', value: completedPayment.utility_company },
{ label: 'Account #', value: completedPayment.account_number },
].map(row => (
<div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dotted #ddd', fontSize: 12 }}>
<span style={{ color: '#666' }}>{row.label}</span>
<span style={{ fontWeight: 'bold' }}>{row.value}</span>
</div>
))}
<div style={{ marginTop: 10 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
<span style={{ color: '#666' }}>Bill Amount</span>
<span>${billAmount.toFixed(2)}</span>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
<span style={{ color: '#666' }}>Service Fee (4.5%)</span>
<span>{completedPayment.is_subscriber ? 'FREE ✅' : `$${completedPayment.service_fee?.toFixed(2)}`}</span>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', borderTop: '2px solid #111', fontSize: 16, fontWeight: 'bold' }}>
<span>TOTAL CHARGED</span>
<span>${completedPayment.total_charged?.toFixed(2)}</span>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
<span style={{ color: '#666' }}>Payment Method</span>
<span>{completedPayment.payment_method === 'cash' ? 'Cash in Store' : 'Card'}</span>
</div>
</div>
{completedPayment.payment_method === 'cash' && (
<div style={{ marginTop: 12, backgroundColor: '#fff3cd', border: '1px solid #f5c518', borderRadius: 8, padding: '10px 12px', fontSize: 11 }}>
<p style={{ margin: 0, fontWeight: 'bold' }}>⚠️ Cash Payment Required</p>
<p style={{ margin: '4px 0 0', color: '#555' }}>Bring this reference number to BSC Marketplace on Firetrial Road to complete your payment.</p>
</div>
)}
<p style={{ margin: '14px 0 0', color: '#999', fontSize: 9, textAlign: 'center' as const, lineHeight: 1.6 }}>
BSC Marketplace acts as a bill payment agent only. Your payment is forwarded to the utility within 1 business day. BSC is not affiliated with any utility company.
</p>
</div>

<button onClick={() => sendWhatsAppReceipt(completedPayment)} style={{ ...primaryBtn, backgroundColor: '#25d366', color: '#fff' }}>
💬 Send Receipt via WhatsApp
</button>
<button onClick={() => printReceipt(completedPayment)} style={{ ...primaryBtn, backgroundColor: '#60a5fa', color: '#000' }}>
🖨️ Print Receipt
</button>
<button onClick={() => { setScreen('home'); setCompletedPayment(null); setCustomerName(''); setCustomerPhone(''); setAccountNumber(''); setAmountToPay(''); }} style={ghostBtn}>
← Pay Another Bill
</button>

<div style={{ marginTop: 8, padding: '12px 14px', backgroundColor: '#0a1220', borderRadius: 12, border: '1px solid #1e3a5f' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11, textAlign: 'center' as const }}>© 2025 BSC Marketplace · Owned by Dedrick Storr Snr & Family · All Rights Reserved</p>
</div>
</div>
</div>
);

// ── SUBSCRIPTION SCREEN ──
if (screen === 'subscription') return (
<div style={pg}>
<Header title="⚡ Annual Subscription" subtitle="Save on every bill payment" back={() => setScreen('home')} />
<div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 18px' }}>
{success && <div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 12, padding: '14px', marginBottom: 16 }}><p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold' }}>{success}</p></div>}
{error && <p style={{ color: '#f87171', backgroundColor: '#2d0000', padding: '10px 12px', borderRadius: 8, marginBottom: 12 }}>{error}</p>}

{/* PLAN COMPARISON */}
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 14, padding: '16px', border: '1px solid #1e3a5f' }}>
<p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 11, letterSpacing: 1 }}>PAY PER USE</p>
<p style={{ margin: '0 0 4px', color: '#fff', fontWeight: 'bold', fontSize: 20 }}>4.5%</p>
<p style={{ margin: '0 0 12px', color: '#4a5568', fontSize: 12 }}>per transaction</p>
{['Standard rate', 'No commitment', 'Pay as you go'].map(f => (
<p key={f} style={{ margin: '4px 0', color: '#6b7280', fontSize: 12 }}>• {f}</p>
))}
</div>
<div style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', borderRadius: 14, padding: '16px', border: '2px solid #f5c518', position: 'relative' as const }}>
<div style={{ position: 'absolute', top: -10, right: 12, backgroundColor: '#f5c518', color: '#000', borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 'bold' }}>BEST VALUE</div>
<p style={{ margin: '0 0 8px', color: '#f5c518', fontSize: 11, letterSpacing: 1 }}>ANNUAL PLAN</p>
<p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 28 }}>$60</p>
<p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 12 }}>per year · $5/month</p>
{['NO service fee ever', 'Unlimited bill payments', 'Priority processing', 'WhatsApp receipts'].map(f => (
<p key={f} style={{ margin: '4px 0', color: '#4ade80', fontSize: 12 }}>✅ {f}</p>
))}
</div>
</div>

{/* SAVINGS EXAMPLE */}
<div style={{ ...card, background: 'linear-gradient(135deg, #0a1f0a, #0d2b14)', borderColor: '#4ade8066' }}>
<p style={{ margin: '0 0 10px', color: '#4ade80', fontWeight: 'bold', fontSize: 14 }}>💰 Example Savings</p>
{[
{ label: 'BEC $200/month', fee: '$9.00 saved per payment', annual: '$108/year' },
{ label: 'Water $80/month', fee: '$3.60 saved per payment', annual: '$43.20/year' },
{ label: 'Cable $150/month', fee: '$6.75 saved per payment', annual: '$81/year' },
].map(ex => (
<div key={ex.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1e3a5f' }}>
<p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{ex.label}</p>
<div style={{ textAlign: 'right' }}>
<p style={{ margin: 0, color: '#4ade80', fontSize: 12, fontWeight: 'bold' }}>{ex.fee}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>{ex.annual}</p>
</div>
</div>
))}
<p style={{ margin: '10px 0 0', color: '#4ade80', fontSize: 13 }}>Pay just $60/year and all service fees are waived.</p>
</div>

{/* SUBSCRIPTION FORM */}
<div style={card}>
<p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Activate Subscription</p>
<label style={lbl}>Full Name</label>
<input placeholder="Customer full name" value={subName} onChange={e => setSubName(e.target.value)} style={inp} />
<label style={lbl}>Phone / WhatsApp</label>
<input placeholder="242-xxx-xxxx" value={subPhone} onChange={e => setSubPhone(e.target.value)} type="tel" style={inp} />
<label style={lbl}>Email (optional)</label>
<input placeholder="email@example.com" value={subEmail} onChange={e => setSubEmail(e.target.value)} type="email" style={inp} />
<label style={lbl}>Payment Method — $60.00</label>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
{(['cash', 'card'] as PaymentMethod[]).map(m => (
<button key={m} onClick={() => setSubPayMethod(m)} style={{ padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 14, backgroundColor: subPayMethod === m ? '#f5c518' : '#0d1f3c', color: subPayMethod === m ? '#000' : '#6b7280' }}>
{m === 'cash' ? '💵 Cash' : '💳 Card'}
</button>
))}
</div>
<button onClick={handleCreateSubscription} disabled={loading} style={{ ...primaryBtn, backgroundColor: loading ? '#555' : '#f5c518', cursor: loading ? 'not-allowed' : 'pointer' }}>
{loading ? 'Activating...' : '✅ Activate — $60.00/year'}
</button>
</div>
</div>
</div>
);

// ── ADMIN SCREEN ──
if (screen === 'admin' && isAdmin) return (
<div style={pg}>
<Header title="⚡ Bill Pay Admin" subtitle="Manage payments & subscriptions" back={() => setScreen('home')} />
<div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 18px' }}>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
{[
{ label: 'TOTAL', value: adminPayments.length, color: '#fff' },
{ label: 'PENDING', value: adminPayments.filter(p => p.payment_status.startsWith('pending')).length, color: '#f5c518' },
{ label: 'SUBSCRIBERS', value: adminSubs.filter(s => s.status === 'active').length, color: '#4ade80' },
].map(stat => (
<div key={stat.label} style={{ ...card, textAlign: 'center', padding: 14, marginBottom: 0 }}>
<p style={{ margin: 0, color: stat.color, fontSize: 22, fontWeight: 'bold' }}>{stat.value}</p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 10 }}>{stat.label}</p>
</div>
))}
</div>

<div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
{(['payments', 'subscriptions'] as const).map(t => (
<button key={t} onClick={() => setAdminTab(t)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 12, backgroundColor: adminTab === t ? '#f5c518' : '#0d1f3c', color: adminTab === t ? '#000' : '#6b7280' }}>
{t === 'payments' ? `Payments (${adminPayments.length})` : `Subscribers (${adminSubs.length})`}
</button>
))}
</div>

{adminLoading && <p style={{ color: '#4a5568', textAlign: 'center', padding: 20 }}>Loading...</p>}

{!adminLoading && adminTab === 'payments' && (
adminPayments.length === 0
? <div style={{ ...card, textAlign: 'center', padding: 30 }}><p style={{ color: '#4a5568' }}>No payments yet</p></div>
: adminPayments.map(p => {
const isPending = p.payment_status.startsWith('pending');
const statusColor = p.payment_status === 'completed' ? '#4ade80' : p.payment_status === 'failed' ? '#f87171' : '#f5c518';
return (
<div key={p.id} style={{ ...card, borderColor: isPending ? '#f5c51866' : '#1e3a5f' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{p.customer_name}</p>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 12 }}>{p.utility_company}</p>
<p style={{ margin: '2px 0', color: '#6b7280', fontSize: 11 }}>Acct: {p.account_number}</p>
<p style={{ margin: '2px 0', color: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}>{p.reference_number}</p>
</div>
<div style={{ textAlign: 'right' }}>
<p style={{ margin: 0, color: statusColor, fontWeight: 'bold', fontSize: 11 }}>{p.payment_status.replace('_', ' ').toUpperCase()}</p>
<p style={{ margin: '4px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 18 }}>${Number(p.total_charged).toFixed(2)}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>Fee: ${Number(p.service_fee).toFixed(2)}</p>
</div>
</div>
<div style={{ display: 'flex', gap: 6, marginBottom: isPending ? 10 : 0, flexWrap: 'wrap' as const }}>
<span style={{ backgroundColor: '#0a1220', color: '#60a5fa', borderRadius: 20, padding: '3px 10px', fontSize: 11, border: '1px solid #1e3a5f' }}>
{p.payment_method === 'cash' ? '💵 Cash' : '💳 Card'}
</span>
{p.is_subscriber && <span style={{ backgroundColor: '#0a1f0a', color: '#4ade80', borderRadius: 20, padding: '3px 10px', fontSize: 11, border: '1px solid #4ade80' }}>⭐ Subscriber</span>}
<span style={{ backgroundColor: '#0a1220', color: '#4a5568', borderRadius: 20, padding: '3px 10px', fontSize: 11, border: '1px solid #1e3a5f' }}>
{new Date(p.created_at).toLocaleDateString()}
</span>
</div>
{isPending && (
<div style={{ display: 'flex', gap: 8 }}>
<button onClick={() => handleMarkProcessed(p.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 13 }}>
✅ Mark Processed
</button>
<button onClick={() => handleMarkFailed(p.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#3b0000', color: '#f87171', border: '1px solid #7f1d1d', cursor: 'pointer', fontSize: 13 }}>
❌ Failed
</button>
</div>
)}
</div>
);
})
)}

{!adminLoading && adminTab === 'subscriptions' && (
adminSubs.length === 0
? <div style={{ ...card, textAlign: 'center', padding: 30 }}><p style={{ color: '#4a5568' }}>No subscribers yet</p></div>
: adminSubs.map(s => (
<div key={s.id} style={card}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{s.customer_name}</p>
<p style={{ margin: '2px 0', color: '#60a5fa', fontSize: 12 }}>{s.customer_phone}</p>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 11 }}>Expires: {new Date(s.end_date).toLocaleDateString()}</p>
</div>
<div style={{ textAlign: 'right' }}>
<span style={{ backgroundColor: s.status === 'active' ? '#0a1f0a' : '#2d0000', color: s.status === 'active' ? '#4ade80' : '#f87171', border: '1px solid ' + (s.status === 'active' ? '#4ade80' : '#f87171'), borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 'bold' }}>
{s.status.toUpperCase()}
</span>
<p style={{ margin: '6px 0 0', color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>${s.amount_paid}</p>
</div>
</div>
</div>
))
)}
</div>
</div>
);

// ── PAY SCREEN ──
if (screen === 'pay') return (
<div style={pg}>
<Header title="⚡ Pay a Bill" subtitle="Secure · Fast · Simple" back={() => setScreen('home')} />
<div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 18px' }}>
{error && <p style={{ color: '#f87171', backgroundColor: '#2d0000', padding: '10px 12px', borderRadius: 8, marginBottom: 12 }}>{error}</p>}

{/* UTILITY SELECTOR */}
<p style={{ ...lbl, marginBottom: 10 }}>Select Utility Company</p>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
{UTILITIES.map(u => (
<button key={u.id} onClick={() => setSelectedUtility(u)} style={{ padding: '14px 8px', borderRadius: 14, border: selectedUtility.id === u.id ? `2px solid ${u.color}` : '1px solid #1e3a5f', cursor: 'pointer', backgroundColor: selectedUtility.id === u.id ? 'rgba(245,197,24,0.1)' : '#0d1f3c', textAlign: 'center' as const, boxShadow: selectedUtility.id === u.id ? `0 0 12px ${u.color}33` : 'none' }}>
<p style={{ margin: '0 0 6px', fontSize: 24 }}>{u.icon}</p>
<p style={{ margin: 0, color: selectedUtility.id === u.id ? u.color : '#aaa', fontWeight: 'bold', fontSize: 11 }}>{u.name}</p>
</button>
))}
</div>

{/* SELECTED UTILITY INFO */}
<div style={{ backgroundColor: '#0a1220', border: `1px solid ${selectedUtility.color}44`, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
<p style={{ margin: 0, color: selectedUtility.color, fontWeight: 'bold', fontSize: 14 }}>{selectedUtility.icon} {selectedUtility.fullName}</p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 12 }}>{selectedUtility.description}</p>
</div>

{/* CUSTOMER DETAILS */}
<div style={card}>
<p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Customer Details</p>
<label style={lbl}>Full Name</label>
<input placeholder="Name on account" value={customerName} onChange={e => setCustomerName(e.target.value)} style={inp} />
<label style={lbl}>Phone / WhatsApp</label>
<input placeholder="242-xxx-xxxx" value={customerPhone} onChange={e => { setCustomerPhone(e.target.value); checkSubscriberStatus(e.target.value); }} type="tel" style={inp} />
<label style={lbl}>Account Number</label>
<input placeholder="Your utility account number" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} style={{ ...inp, marginBottom: 0 }} />
</div>

{/* AMOUNT */}
<div style={card}>
<p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Bill Amount</p>
<label style={lbl}>Amount to Pay ($)</label>
<input type="number" placeholder="0.00" value={amountToPay} onChange={e => setAmountToPay(e.target.value)} style={{ ...inp, fontSize: 22, fontWeight: 'bold' }} />

{/* SUBSCRIBER STATUS */}
{isSubscriber ? (
<div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>⭐ Active Subscriber — No Service Fee!</p>
</div>
) : (
<div style={{ backgroundColor: '#1a1400', border: '1px solid #f5c51866', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
<p style={{ margin: 0, color: '#f5c518', fontSize: 12 }}>Service fee: 4.5% (covers banking costs). <button onClick={() => setScreen('subscription')} style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}>Subscribe for $60/year to waive all fees.</button></p>
</div>
)}

{/* LIVE FEE BREAKDOWN */}
{billAmount > 0 && (
<div style={{ backgroundColor: '#060d1f', borderRadius: 10, padding: '12px 14px', border: '1px solid #1e3a5f' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
<p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>Bill Amount</p>
<p style={{ margin: 0, fontSize: 13 }}>${billAmount.toFixed(2)}</p>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
<p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>Service Fee (4.5%)</p>
<p style={{ margin: 0, color: isSubscriber ? '#4ade80' : '#f5c518', fontSize: 13 }}>{isSubscriber ? 'FREE ✅' : `+$${serviceFee.toFixed(2)}`}</p>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1e3a5f', paddingTop: 8 }}>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>Total You Pay</p>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 18 }}>${totalCharged.toFixed(2)}</p>
</div>
</div>
)}
</div>

{/* PAYMENT METHOD */}
<div style={card}>
<p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>How Will You Pay BSC?</p>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
{([
{ m: 'cash' as PaymentMethod, icon: '💵', label: 'Cash in Store', sub: 'Pay at BSC Marketplace' },
{ m: 'card' as PaymentMethod, icon: '💳', label: 'Card / Online', sub: 'Pay via card terminal' },
]).map(opt => (
<button key={opt.m} onClick={() => setPaymentMethod(opt.m)} style={{ padding: '16px 12px', borderRadius: 12, border: paymentMethod === opt.m ? '2px solid #f5c518' : '1px solid #1e3a5f', cursor: 'pointer', backgroundColor: paymentMethod === opt.m ? 'rgba(245,197,24,0.12)' : '#0d1f3c', textAlign: 'center' as const }}>
<p style={{ margin: '0 0 6px', fontSize: 24 }}>{opt.icon}</p>
<p style={{ margin: '0 0 2px', color: paymentMethod === opt.m ? '#f5c518' : '#fff', fontWeight: 'bold', fontSize: 13 }}>{opt.label}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{opt.sub}</p>
</button>
))}
</div>

{paymentMethod === 'cash' && (
<div style={{ backgroundColor: '#0a1220', border: '1px solid #60a5fa66', borderRadius: 10, padding: '10px 14px' }}>
<p style={{ margin: 0, color: '#60a5fa', fontSize: 12 }}>📍 Visit BSC Marketplace on Firetrial Road, Nassau with your reference number to complete payment.</p>
</div>
)}
</div>

{/* LEGAL DISCLAIMER */}
<div style={{ backgroundColor: '#0a0f1e', border: '1px solid #1e3a5f', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11, lineHeight: 1.6 }}>
⚖️ BSC Marketplace acts as a bill payment agent only. Your payment is processed and forwarded to the utility company within 1 business day. BSC does not hold customer funds beyond the processing period. A 4.5% service fee applies per transaction for non-subscribers to cover banking and processing costs. BSC is not affiliated with any utility company.
</p>
</div>

<button onClick={handleSubmitPayment} disabled={loading || billAmount <= 0 || !customerName || !customerPhone || !accountNumber} style={{ ...primaryBtn, backgroundColor: loading || billAmount <= 0 ? '#2a2a2a' : '#f5c518', color: billAmount <= 0 ? '#555' : '#000', cursor: loading || billAmount <= 0 ? 'not-allowed' : 'pointer' }}>
{loading ? '⏳ Processing...' : `✅ Submit — Pay $${totalCharged.toFixed(2)}`}
</button>
<button onClick={() => setScreen('home')} style={ghostBtn}>← Cancel</button>
</div>
</div>
);

// ── HOME SCREEN ──
return (
<div style={pg}>
<Header title="⚡ BSC Bill Pay" subtitle="Secure utility payment service" />
<div style={{ maxWidth: 640, margin: '0 auto', padding: '0 0 30px' }}>

{/* HERO */}
<div style={{ background: 'linear-gradient(135deg, #001a2a, #002a3a, #001a14)', padding: '28px 20px', marginBottom: 0 }}>
<p style={{ margin: '0 0 8px', color: '#60a5fa', fontSize: 11, letterSpacing: 2, fontWeight: 'bold' }}>BAHAMIAN SEAFOOD CONNECTION</p>
<p style={{ margin: '0 0 6px', color: '#fff', fontWeight: 'bold', fontSize: 22, lineHeight: 1.3 }}>Pay Your Bills.<br />Simple. Fast. Secure.</p>
<p style={{ margin: '0 0 20px', color: '#4a5568', fontSize: 13 }}>BEC · Water · Cable · Aliv · BTC · Flow — all in one place.</p>
<div style={{ display: 'flex', gap: 10 }}>
<button onClick={() => setScreen('pay')} style={{ flex: 1, padding: '14px', borderRadius: 12, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', fontSize: 15, cursor: 'pointer' }}>
⚡ Pay a Bill Now
</button>
<button onClick={() => setScreen('subscription')} style={{ flex: 1, padding: '14px', borderRadius: 12, backgroundColor: 'transparent', color: '#f5c518', border: '2px solid #f5c518', fontWeight: 'bold', fontSize: 13, cursor: 'pointer' }}>
⭐ Subscribe $60/yr
</button>
</div>
</div>

<div style={{ padding: '20px 18px' }}>
{/* UTILITIES GRID */}
<p style={{ margin: '0 0 12px', color: '#f5c518', fontWeight: 'bold', fontSize: 15 }}>Supported Utilities</p>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
{UTILITIES.map(u => (
<button key={u.id} onClick={() => { setSelectedUtility(u); setScreen('pay'); }} style={{ padding: '16px 10px', borderRadius: 14, backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', cursor: 'pointer', textAlign: 'center' as const }}>
<p style={{ margin: '0 0 8px', fontSize: 28 }}>{u.icon}</p>
<p style={{ margin: '0 0 2px', color: '#fff', fontWeight: 'bold', fontSize: 12 }}>{u.name}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>{u.description}</p>
</button>
))}
</div>

{/* HOW IT WORKS */}
<div style={card}>
<p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>How It Works</p>
{[
{ icon: '1️⃣', title: 'Select your utility', desc: 'Choose BEC, Water, Cable, Aliv, BTC, or Flow' },
{ icon: '2️⃣', title: 'Enter your details', desc: 'Name, phone, account number, and bill amount' },
{ icon: '3️⃣', title: 'Pay BSC the total', desc: 'Cash in store or card — plus 4.5% service fee' },
{ icon: '4️⃣', title: 'BSC pays the utility', desc: 'Your bill is paid within 1 business day' },
{ icon: '5️⃣', title: 'Receipt to WhatsApp', desc: 'Instant confirmation sent to your phone' },
].map(step => (
<div key={step.icon} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
<span style={{ fontSize: 20, flexShrink: 0 }}>{step.icon}</span>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{step.title}</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 12 }}>{step.desc}</p>
</div>
</div>
))}
</div>

{/* SUBSCRIPTION PROMO */}
<div style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '2px solid #f5c518', borderRadius: 16, padding: '18px 20px', marginBottom: 14 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
<div>
<p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>⭐ Annual Subscription</p>
<p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 13 }}>Pay all your bills with zero service fee</p>
{['No 4.5% fee on any transaction', 'Unlimited bill payments', 'Priority processing', 'WhatsApp receipts'].map(f => (
<p key={f} style={{ margin: '3px 0', color: '#4ade80', fontSize: 12 }}>✅ {f}</p>
))}
</div>
<div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 28 }}>$60</p>
<p style={{ margin: 0, color: '#6b7280', fontSize: 11 }}>per year</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 10 }}>= $5/month</p>
</div>
</div>
<button onClick={() => setScreen('subscription')} style={{ width: '100%', padding: '12px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 14 }}>
Subscribe Now — Save on Every Bill
</button>
</div>

{/* SECURITY BADGES */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
{[
{ icon: '🔒', title: 'Secure', desc: 'Encrypted & safe' },
{ icon: '⚡', title: 'Fast', desc: '1 business day' },
{ icon: '🧾', title: 'Receipts', desc: 'WhatsApp + print' },
].map(b => (
<div key={b.title} style={{ backgroundColor: '#0d1f3c', borderRadius: 12, padding: '14px 10px', textAlign: 'center' as const, border: '1px solid #1e3a5f' }}>
<p style={{ margin: '0 0 4px', fontSize: 22 }}>{b.icon}</p>
<p style={{ margin: '0 0 2px', color: '#fff', fontWeight: 'bold', fontSize: 12 }}>{b.title}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>{b.desc}</p>
</div>
))}
</div>

{/* LEGAL DISCLAIMER */}
<div style={{ backgroundColor: '#0a0f1e', border: '1px solid #1e3a5f', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
<p style={{ margin: '0 0 6px', color: '#6b7280', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 }}>LEGAL NOTICE</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11, lineHeight: 1.7 }}>
BSC Marketplace acts as a bill payment agent only. Customer payments are collected by BSC and forwarded directly to the utility corporation within 1 business day. BSC does not permanently hold customer funds. A 4.5% service fee is charged to cover banking and payment processing costs. Annual subscribers pay no service fee. BSC Marketplace is not affiliated with BEC, Water Authority, Cable Bahamas, Aliv, BTC, or Flow.
</p>
</div>

{/* COPYRIGHT FOOTER */}
<div style={{ textAlign: 'center' as const, padding: '14px 0', borderTop: '1px solid #1e3a5f' }}>
<p style={{ margin: 0, color: '#2a3a5a', fontSize: 10 }}>© 2025 BSC Marketplace — Bahamian Seafood Connection</p>
<p style={{ margin: '2px 0 0', color: '#2a3a5a', fontSize: 10 }}>Owned by Dedrick Storr Snr & Family · All Rights Reserved</p>
</div>
</div>
</div>
</div>
);
}
