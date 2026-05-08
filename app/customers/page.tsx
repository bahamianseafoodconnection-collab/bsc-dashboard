// File: app/customers/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getAllCustomers, type Customer } from '../../lib/store';

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'visits' | 'spent' | 'recent' | 'name'>('visits');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [isControlAdmin, setIsControlAdmin] = useState(false);

  useEffect(() => {
    setCustomers(getAllCustomers());
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('role').eq('id', user.id).single().then(({ data }) => {
        if (data?.role === 'control_admin') setIsControlAdmin(true);
      });
    });
  }, []);

  const filtered = customers
    .filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.replace(/\D/g, '').includes(search.replace(/\D/g, ''))
    )
    .sort((a, b) => {
      if (sortBy === 'visits') return (b.visitCount || 0) - (a.visitCount || 0);
      if (sortBy === 'spent')  return (b.totalSpent || 0) - (a.totalSpent || 0);
      if (sortBy === 'name')   return a.name.localeCompare(b.name);
      if (sortBy === 'recent') return new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime();
      return 0;
    });

  const totalRevenue    = customers.reduce((s, c) => s + (c.totalSpent || 0), 0);
  const totalVisits     = customers.reduce((s, c) => s + (c.visitCount || 0), 0);
  const avgSpend        = customers.length > 0 ? totalRevenue / customers.length : 0;
  const repeatCustomers = customers.filter(c => (c.visitCount || 0) > 1).length;

  const pg: React.CSSProperties = {
    padding: 16, backgroundColor: '#060d1f', minHeight: '100vh',
    color: '#fff', fontFamily: 'sans-serif', paddingBottom: 100,
    maxWidth: 640, margin: '0 auto',
  };
  const card: React.CSSProperties = {
    backgroundColor: '#0d1f3c', borderRadius: 14, padding: '14px 16px',
    border: '1px solid #1e3a5f', marginBottom: 12,
  };
  const inp: React.CSSProperties = {
    display: 'block', width: '100%', padding: '12px 13px', borderRadius: 10,
    backgroundColor: '#111c33', color: '#fff', border: '1px solid #1e2d4a',
    fontSize: 15, marginBottom: 12, boxSizing: 'border-box' as const, outline: 'none',
  };

  const BSCControlBack = () => (
    <button onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '1px solid #f5c518', borderRadius: 10, color: '#f5c518', fontWeight: 'bold', fontSize: 12, cursor: 'pointer', padding: '7px 14px', marginBottom: 14 }}>
      ← BSC Control
    </button>
  );

  const whatsappCustomer = (c: Customer) => {
    let raw = c.phone.replace(/\D/g, '');
    if (raw.startsWith('242') && raw.length === 10) raw = '1' + raw;
    else if (raw.length === 7) raw = '1242' + raw;
    else if (!raw.startsWith('1')) raw = '1242' + raw;
    window.open(`https://api.whatsapp.com/send?phone=${raw}`, '_blank');
  };

  // ── CUSTOMER DETAIL VIEW ──
  if (selected) return (
    <div style={pg}>
      {isControlAdmin && <BSCControlBack />}
      <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 14, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        ← Back to Customers
      </button>
      <div style={{ ...card, background: 'linear-gradient(135deg, #0d1f3c, #132a4a)', borderColor: '#f5c518' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ width: 52, height: 52, borderRadius: '50%', backgroundColor: '#f5c518', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 'bold', color: '#000', marginBottom: 10 }}>
              {selected.name.charAt(0).toUpperCase()}
            </div>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: 20 }}>{selected.name}</p>
            <p style={{ margin: '4px 0 0', color: '#60a5fa', fontSize: 14 }}>📱 {selected.phone}</p>
          </div>
          <span style={{ backgroundColor: '#0a1f0a', color: '#4ade80', border: '1px solid #4ade80', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 'bold' }}>
            {(selected.visitCount || 0) > 5 ? 'LOYAL' : (selected.visitCount || 0) > 1 ? 'REPEAT' : 'NEW'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'TOTAL SPENT', value: '$' + (selected.totalSpent || 0).toFixed(2), color: '#4ade80' },
            { label: 'VISITS',      value: String(selected.visitCount || 0),             color: '#f5c518' },
            { label: 'AVG/VISIT',   value: '$' + ((selected.visitCount || 0) > 0 ? ((selected.totalSpent || 0) / selected.visitCount).toFixed(2) : '0.00'), color: '#60a5fa' },
          ].map(stat => (
            <div key={stat.label} style={{ backgroundColor: '#060d1f', borderRadius: 10, padding: '10px 12px', textAlign: 'center' as const }}>
              <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>{stat.label}</p>
              <p style={{ margin: '6px 0 0', color: stat.color, fontWeight: 'bold', fontSize: 16 }}>{stat.value}</p>
            </div>
          ))}
        </div>
        <p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 11 }}>Last visit: <span style={{ color: '#aaa' }}>{selected.lastVisit || 'N/A'}</span></p>
        <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>Customer ID: <span style={{ color: '#4a5568', fontSize: 10, fontFamily: 'monospace' }}>{selected.id}</span></p>
      </div>
      <p style={{ color: '#6b7280', fontSize: 10, letterSpacing: 2, margin: '0 0 10px' }}>ACTIONS</p>
      <button onClick={() => whatsappCustomer(selected)} style={{ width: '100%', padding: '13px', borderRadius: 12, backgroundColor: '#25d366', color: '#000', fontWeight: 'bold', border: 'none', fontSize: 15, cursor: 'pointer', marginBottom: 10 }}>
        💬 WhatsApp {selected.name.split(' ')[0]}
      </button>
      <button onClick={() => { const subject = encodeURIComponent(`BSC Marketplace — Special offer for ${selected.name}`); const body = encodeURIComponent(`Hi ${selected.name},\n\nThank you for being a valued BSC Marketplace customer!\n\nWe have fresh seafood and products available. Visit us or order online:\nhttps://project-1fnu0.vercel.app/market\n\nFiretrial Road, Nassau, Bahamas\nWhatsApp: +1 (242) 361-3474\n\nFresh · Local · Bahamian 🐟`); window.open(`mailto:?subject=${subject}&body=${body}`, '_blank'); }} style={{ width: '100%', padding: '13px', borderRadius: 12, backgroundColor: '#60a5fa', color: '#000', fontWeight: 'bold', border: 'none', fontSize: 15, cursor: 'pointer', marginBottom: 10 }}>
        📧 Send Email
      </button>
      <button onClick={() => router.push('/pos')} style={{ width: '100%', padding: '13px', borderRadius: 12, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', fontSize: 15, cursor: 'pointer', marginBottom: 10 }}>
        🛒 New Sale for {selected.name.split(' ')[0]}
      </button>
      <div style={card}>
        <p style={{ margin: '0 0 10px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>Customer Value Tier</p>
        {[
          { label: 'New Customer',    min: 0,  max: 1,   color: '#6b7280' },
          { label: 'Repeat Customer', min: 2,  max: 4,   color: '#60a5fa' },
          { label: 'Loyal Customer',  min: 5,  max: 9,   color: '#4ade80' },
          { label: 'VIP Customer',    min: 10, max: 999, color: '#f5c518' },
        ].map(tier => {
          const visits = selected.visitCount || 0;
          const isActive = visits >= tier.min && visits <= tier.max;
          return (
            <div key={tier.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1e3a5f' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: isActive ? tier.color : '#2a3a5a' }} />
                <p style={{ margin: 0, color: isActive ? tier.color : '#4a5568', fontSize: 13, fontWeight: isActive ? 'bold' : 'normal' }}>{tier.label}</p>
              </div>
              <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{tier.min === 0 ? '1st visit' : tier.max === 999 ? `${tier.min}+ visits` : `${tier.min}–${tier.max} visits`}</p>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── MAIN LIST VIEW ──
  return (
    <div style={pg}>
      {isControlAdmin && <BSCControlBack />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, color: '#f5c518', fontSize: 20, fontWeight: 'bold' }}>👥 Customers</h1>
          <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>BSC Marketplace · {customers.length} total</p>
        </div>
        <button onClick={() => router.push('/pos')} style={{ padding: '9px 14px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 13 }}>
          🛒 POS
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'CUSTOMERS', value: String(customers.length), color: '#f5c518' },
          { label: 'REVENUE',   value: '$' + totalRevenue.toFixed(0), color: '#4ade80' },
          { label: 'VISITS',    value: String(totalVisits),    color: '#60a5fa' },
          { label: 'REPEAT',    value: String(repeatCustomers),color: '#a78bfa' },
        ].map(kpi => (
          <div key={kpi.label} style={{ backgroundColor: '#0d1f3c', borderRadius: 12, padding: '10px 12px', border: '1px solid #1e3a5f', textAlign: 'center' as const }}>
            <p style={{ margin: 0, color: '#4a5568', fontSize: 8, letterSpacing: 1 }}>{kpi.label}</p>
            <p style={{ margin: '5px 0 0', color: kpi.color, fontWeight: 'bold', fontSize: 15 }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <input placeholder="🔍 Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" style={inp} />

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' as const }}>
        {([
          { key: 'visits', label: 'Most Visits' },
          { key: 'spent',  label: 'Top Spenders' },
          { key: 'recent', label: 'Recent' },
          { key: 'name',   label: 'A–Z' },
        ] as { key: typeof sortBy; label: string }[]).map(opt => (
          <button key={opt.key} onClick={() => setSortBy(opt.key)} style={{ padding: '7px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' as const, backgroundColor: sortBy === opt.key ? '#f5c518' : '#0d1f3c', color: sortBy === opt.key ? '#000' : '#6b7280' }}>
            {opt.label}
          </button>
        ))}
      </div>

      {customers.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>👥</p>
          <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>No customers yet</p>
          <p style={{ margin: '8px 0 0', color: '#4a5568', fontSize: 13 }}>Customers are saved automatically when you complete a sale in the POS.</p>
        </div>
      )}

      {filtered.length === 0 && customers.length > 0 && (
        <p style={{ color: '#4a5568', textAlign: 'center', padding: 20 }}>No customers match your search</p>
      )}

      {filtered.map((c, i) => {
        const avgPerVisit = (c.visitCount || 0) > 0 ? (c.totalSpent || 0) / c.visitCount : 0;
        const tier = (c.visitCount || 0) >= 10 ? { label: 'VIP', color: '#f5c518' }
          : (c.visitCount || 0) >= 5 ? { label: 'LOYAL', color: '#4ade80' }
          : (c.visitCount || 0) >= 2 ? { label: 'REPEAT', color: '#60a5fa' }
          : { label: 'NEW', color: '#6b7280' };
        return (
          <div key={c.id} onClick={() => setSelected(c)} style={{ ...card, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', backgroundColor: i < 3 ? '#f5c518' : '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 'bold', color: i < 3 ? '#000' : '#aaa', flexShrink: 0 }}>
              {i < 3 ? ['🥇', '🥈', '🥉'][i] : c.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.name}</p>
                <span style={{ backgroundColor: '#060d1f', color: tier.color, border: '1px solid ' + tier.color, borderRadius: 20, padding: '1px 7px', fontSize: 9, fontWeight: 'bold', flexShrink: 0 }}>{tier.label}</span>
              </div>
              <p style={{ margin: 0, color: '#60a5fa', fontSize: 12 }}>📱 {c.phone}</p>
              <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>Last visit: {c.lastVisit || 'N/A'}</p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>${(c.totalSpent || 0).toFixed(2)}</p>
              <p style={{ margin: '2px 0 0', color: '#f5c518', fontSize: 11 }}>{c.visitCount || 0} visits</p>
              <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 10 }}>${avgPerVisit.toFixed(2)}/visit</p>
            </div>
          </div>
        );
      })}

      {customers.length > 0 && (
        <div style={{ ...card, background: 'linear-gradient(135deg, #0a1220, #0d1a2e)', marginTop: 8 }}>
          <p style={{ margin: '0 0 10px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>Customer Summary</p>
          {[
            { label: 'Total Customers',         value: String(customers.length) },
            { label: 'Total Revenue',            value: '$' + totalRevenue.toFixed(2) },
            { label: 'Avg Spend Per Customer',   value: '$' + avgSpend.toFixed(2) },
            { label: 'Total Visits',             value: String(totalVisits) },
            { label: 'Repeat Customers',         value: repeatCustomers + ' (' + (customers.length > 0 ? Math.round((repeatCustomers / customers.length) * 100) : 0) + '%)' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #1e3a5f' }}>
              <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{row.label}</p>
              <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 13 }}>{row.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
