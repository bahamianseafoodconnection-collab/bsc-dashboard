'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── COD FLAG RULES ───────────────────────────────────────────
// 1 cancellation → Yellow flag · Warning issued
// 2 cancellations → Orange flag · Final warning
// 3+ cancellations → RED flag · COD BLOCKED
// Pickup + cash in store ONLY
// Items must be in store stock to order online
// ─────────────────────────────────────────────────────────────

type FlagLevel = 'clean' | 'warning' | 'final_warning' | 'blocked';

type CustomerFlag = {
id: string;
customer_name: string;
customer_phone: string;
cod_cancellations: number;
flag_level: FlagLevel;
blocked_at?: string;
notes: string;
created_at: string;
last_incident: string;
};

const FLAG_CONFIG: Record<FlagLevel, { color: string; bg: string; border: string; label: string; emoji: string; action: string }> = {
clean: { color: '#2e7d32', bg: '#e8f5e9', border: '#2e7d32', label: 'Clean', emoji: '✅', action: 'No issues' },
warning: { color: '#d97706', bg: '#fef9e7', border: '#f4c842', label: 'Warning', emoji: '⚠️', action: '1st cancellation — Warning issued' },
final_warning: { color: '#ea580c', bg: '#fff3e8', border: '#ea580c', label: 'Final Warning', emoji: '🟠', action: '2nd cancellation — Final warning' },
blocked: { color: '#dc2626', bg: '#fde8e8', border: '#dc2626', label: 'COD BLOCKED', emoji: '🚫', action: 'Pickup + cash only · In-store stock required' },
};

function getFlagLevel(cancellations: number): FlagLevel {
if (cancellations === 0) return 'clean';
if (cancellations === 1) return 'warning';
if (cancellations === 2) return 'final_warning';
return 'blocked';
}

export default function CODFlagSystemPage() {
const [flags, setFlags] = useState<CustomerFlag[]>([]);
const [search, setSearch] = useState('');
const [filterLevel, setFilterLevel] = useState<FlagLevel | 'all'>('all');
const [adding, setAdding] = useState(false);
const [newPhone, setNewPhone] = useState('');
const [newName, setNewName] = useState('');
const [newNote, setNewNote] = useState('');
const [loading, setLoading] = useState(false);
const [fetching, setFetching] = useState(true);
const [fetchError, setFetchError] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;
  (async () => {
    setFetching(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('customer_cod_flags')
      .select('*')
      .order('last_incident', { ascending: false, nullsFirst: false })
      .limit(500);
    if (cancelled) return;
    if (error) {
      setFetchError(error.message);
      setFlags([]);
    } else {
      setFlags((data || []) as CustomerFlag[]);
    }
    setFetching(false);
  })();
  return () => { cancelled = true; };
}, []);

const filtered = flags.filter((f) => {
const matchSearch = f.customer_name.toLowerCase().includes(search.toLowerCase()) || f.customer_phone.includes(search);
const matchLevel = filterLevel === 'all' || f.flag_level === filterLevel;
return matchSearch && matchLevel;
});

async function addCancellation(customerId: string) {
setFlags((prev) => prev.map((f) => {
if (f.id !== customerId) return f;
const newCount = f.cod_cancellations + 1;
const newLevel = getFlagLevel(newCount);
return {
...f,
cod_cancellations: newCount,
flag_level: newLevel,
last_incident: new Date().toISOString().split('T')[0],
blocked_at: newLevel === 'blocked' ? new Date().toISOString().split('T')[0] : f.blocked_at,
};
}));
try {
const flag = flags.find((f) => f.id === customerId);
if (flag) {
const newCount = flag.cod_cancellations + 1;
await supabase.from('customer_cod_flags').update({
cod_cancellations: newCount,
flag_level: getFlagLevel(newCount),
last_incident: new Date().toISOString().split('T')[0],
}).eq('id', customerId);
}
} catch { /* continue */ }
}

async function addNewFlag(e: React.FormEvent) {
e.preventDefault();
setLoading(true);
const newFlag: CustomerFlag = {
id: Date.now().toString(),
customer_name: newName,
customer_phone: newPhone,
cod_cancellations: 1,
flag_level: 'warning',
notes: newNote || '1st COD cancellation recorded.',
created_at: new Date().toISOString().split('T')[0],
last_incident: new Date().toISOString().split('T')[0],
};
try {
await supabase.from('customer_cod_flags').insert([newFlag]);
} catch { /* continue */ }
setFlags((prev) => [newFlag, ...prev]);
setNewName(''); setNewPhone(''); setNewNote('');
setAdding(false);
setLoading(false);
}

async function clearFlag(customerId: string) {
setFlags((prev) => prev.map((f) => f.id === customerId ? { ...f, cod_cancellations: 0, flag_level: 'clean', blocked_at: undefined } : f));
try {
await supabase.from('customer_cod_flags').update({ cod_cancellations: 0, flag_level: 'clean' }).eq('id', customerId);
} catch { /* continue */ }
}

const blockedCount = flags.filter((f) => f.flag_level === 'blocked').length;
const warningCount = flags.filter((f) => f.flag_level === 'warning' || f.flag_level === 'final_warning').length;

return (
<div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

{/* HEADER */}
<header style={{ backgroundColor: '#1a2e5a', padding: '0 16px', position: 'sticky', top: 0, zIndex: 40 }}>
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
<div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
<Link href="/dashboard" style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, textDecoration: 'none', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>
← BSC Control
</Link>
<div>
<div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>COD Flag System</div>
<div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>Cash on Delivery · Customer Risk Management</div>
</div>
</div>
<button onClick={() => setAdding(true)} style={{ backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: '8px', padding: '7px 14px', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}>
+ Flag Customer
</button>
</div>
</header>

<div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px 16px' }}>

{/* RULES CARD */}
<div style={{ backgroundColor: '#1a2e5a', borderRadius: '16px', padding: '18px', marginBottom: '16px' }}>
<div style={{ color: '#f4c842', fontWeight: 900, fontSize: '14px', marginBottom: '12px' }}>📋 COD Flag Rules</div>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
{[
{ emoji: '✅', count: '0x', label: 'Clean', desc: 'COD available', color: '#e8f5e9', text: '#2e7d32' },
{ emoji: '⚠️', count: '1x', label: 'Warning', desc: 'Warning issued', color: '#fef9e7', text: '#d97706' },
{ emoji: '🟠', count: '2x', label: 'Final Warning', desc: 'Last chance', color: '#fff3e8', text: '#ea580c' },
{ emoji: '🚫', count: '3x+', label: 'BLOCKED', desc: 'Pickup only · In-store stock', color: '#fde8e8', text: '#dc2626' },
].map((rule) => (
<div key={rule.label} style={{ backgroundColor: rule.color, borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
<div style={{ fontSize: '20px', marginBottom: '4px' }}>{rule.emoji}</div>
<div style={{ color: rule.text, fontWeight: 900, fontSize: '14px' }}>{rule.count}</div>
<div style={{ color: rule.text, fontWeight: 800, fontSize: '11px' }}>{rule.label}</div>
<div style={{ color: '#666', fontSize: '9px', marginTop: '2px', lineHeight: 1.3 }}>{rule.desc}</div>
</div>
))}
</div>
</div>

{/* STATS */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
{[
{ label: 'COD Blocked', value: blockedCount, color: '#fde8e8', text: '#dc2626', emoji: '🚫' },
{ label: 'Flagged', value: warningCount, color: '#fef9e7', text: '#d97706', emoji: '⚠️' },
{ label: 'Total Flagged', value: flags.length, color: '#e8f4fd', text: '#1a2e5a', emoji: '📋' },
].map((s) => (
<div key={s.label} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', textAlign: 'center' }}>
<div style={{ fontSize: '24px', marginBottom: '6px' }}>{s.emoji}</div>
<div style={{ color: s.text, fontWeight: 900, fontSize: '24px' }}>{s.value}</div>
<div style={{ color: '#999', fontSize: '11px', marginTop: '2px' }}>{s.label}</div>
</div>
))}
</div>

{/* SEARCH + FILTER */}
<div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
<input
type="text"
placeholder="Search by name or phone..."
value={search}
onChange={(e) => setSearch(e.target.value)}
style={{ flex: 1, minWidth: '200px', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none' }}
/>
<div style={{ display: 'flex', gap: '6px' }}>
{(['all', 'blocked', 'final_warning', 'warning'] as const).map((level) => (
<button
key={level}
onClick={() => setFilterLevel(level)}
style={{ padding: '8px 12px', borderRadius: '20px', border: 'none', backgroundColor: filterLevel === level ? '#1a2e5a' : '#f0f0f0', color: filterLevel === level ? '#fff' : '#555', fontSize: '11px', fontWeight: filterLevel === level ? 800 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
>
{level === 'all' ? 'All' : FLAG_CONFIG[level].emoji + ' ' + FLAG_CONFIG[level].label}
</button>
))}
</div>
</div>

{/* FLAG LIST */}
<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
{filtered.length === 0 && (
<div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '40px', textAlign: 'center', color: '#999' }}>
<div style={{ fontSize: '40px', marginBottom: '10px' }}>✅</div>
<div style={{ fontWeight: 700 }}>No flagged customers found</div>
</div>
)}
{filtered.map((flag) => {
const cfg = FLAG_CONFIG[flag.flag_level];
return (
<div key={flag.id} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `2px solid ${cfg.border}20` }}>
<div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
<div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
<div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
{cfg.emoji}
</div>
<div>
<div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px' }}>{flag.customer_name}</div>
<div style={{ color: '#666', fontSize: '12px' }}>{flag.customer_phone}</div>
<div style={{ color: '#999', fontSize: '11px' }}>Last incident: {flag.last_incident}</div>
</div>
</div>
<div style={{ textAlign: 'right' }}>
<div style={{ backgroundColor: cfg.bg, color: cfg.color, fontSize: '11px', fontWeight: 900, padding: '4px 10px', borderRadius: '20px', border: `1px solid ${cfg.border}40` }}>
{cfg.emoji} {cfg.label}
</div>
<div style={{ color: '#999', fontSize: '11px', marginTop: '4px' }}>{flag.cod_cancellations} cancellation{flag.cod_cancellations !== 1 ? 's' : ''}</div>
</div>
</div>

{/* Blocked customer notice */}
{flag.flag_level === 'blocked' && (
<div style={{ backgroundColor: '#fde8e8', borderRadius: '10px', padding: '10px 14px', marginBottom: '10px', border: '1px solid rgba(220,38,38,0.2)' }}>
<div style={{ color: '#dc2626', fontWeight: 800, fontSize: '12px', marginBottom: '3px' }}>🚫 COD DELIVERY BLOCKED since {flag.blocked_at}</div>
<div style={{ color: '#666', fontSize: '11px' }}>Customer must visit BSC Firetrial Road · Pay cash · Item must be in-store stock · No online delivery available</div>
</div>
)}

<div style={{ color: '#666', fontSize: '12px', marginBottom: '12px', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
📝 {flag.notes}
</div>

<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
<a
href={`https://wa.me/${flag.customer_phone.replace(/\D/g,'')}?text=Hi ${flag.customer_name}, this is BSC Marketplace. We are reaching out regarding your recent Cash on Delivery order cancellation. ${flag.flag_level === 'blocked' ? 'Your COD delivery has been suspended. You may visit us at Firetrial Road to purchase in store.' : 'Please note that further cancellations may result in COD delivery being suspended.'}`}
target="_blank"
rel="noreferrer"
style={{ display: 'inline-block', backgroundColor: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: '8px', padding: '7px 12px', fontWeight: 700, fontSize: '12px' }}
>
💬 WhatsApp
</a>
{flag.flag_level !== 'blocked' && (
<button
onClick={() => addCancellation(flag.id)}
style={{ backgroundColor: '#fde8e8', color: '#dc2626', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '8px', padding: '7px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
>
+ Add Cancellation
</button>
)}
<button
onClick={() => clearFlag(flag.id)}
style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', border: '1px solid rgba(46,125,50,0.2)', borderRadius: '8px', padding: '7px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
>
✅ Clear Flag
</button>
</div>
</div>
);
})}
</div>
</div>

{/* ADD FLAG MODAL */}
{adding && (
<>
<div onClick={() => setAdding(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 60 }} />
<div style={{ position: 'fixed', inset: '20px', maxWidth: '420px', margin: '0 auto', backgroundColor: '#fff', borderRadius: '20px', zIndex: 61, padding: '28px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', overflowY: 'auto', maxHeight: '90vh' }}>
<h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px', marginBottom: '20px' }}>🚩 Flag Customer — COD Cancellation</h2>
<form onSubmit={addNewFlag}>
{[
{ label: 'Customer Name', value: newName, setter: setNewName, placeholder: 'Full name', type: 'text' },
{ label: 'Phone / WhatsApp', value: newPhone, setter: setNewPhone, placeholder: '+1 (242) 000-0000', type: 'tel' },
].map((f) => (
<div key={f.label} style={{ marginBottom: '14px' }}>
<label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>{f.label}</label>
<input type={f.type} value={f.value} onChange={(e) => f.setter(e.target.value)} placeholder={f.placeholder} required style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const }} />
</div>
))}
<div style={{ marginBottom: '20px' }}>
<label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Notes</label>
<textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="What happened with this COD order?" rows={3} style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical' }} />
</div>
<div style={{ backgroundColor: '#fef9e7', borderRadius: '10px', padding: '12px 14px', marginBottom: '18px' }}>
<div style={{ color: '#d97706', fontWeight: 700, fontSize: '12px', marginBottom: '4px' }}>⚠️ This will record 1st cancellation</div>
<div style={{ color: '#666', fontSize: '11px' }}>Customer receives Warning status. A WhatsApp notice will be available to send.</div>
</div>
<button type="submit" disabled={loading} style={{ width: '100%', backgroundColor: loading ? '#e5e7eb' : '#dc2626', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px', fontWeight: 900, fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '10px' }}>
{loading ? 'Saving...' : '🚩 Flag This Customer'}
</button>
<button type="button" onClick={() => setAdding(false)} style={{ width: '100%', backgroundColor: '#f8f9fa', color: '#666', border: '1.5px solid #e5e7eb', borderRadius: '12px', padding: '13px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
Cancel
</button>
</form>
</div>
</>
)}
</div>
);
}
