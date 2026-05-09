'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Screen = 'home' | 'apply' | 'supplier-login' | 'portal' | 'admin' | 'spiny-tails';

type Application = {
  // Field names match the public.suppliers schema:
  //   name (canonical) · contact_name · contact_phone · contact_email
  name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  product_types: string;
  message: string;
};

type Product = {
  id: string;
  name: string;
  category: string;
  case_cost: number;
  weight_lbs: number;
  price_per_lb: number;
  status: 'pending' | 'approved' | 'live';
  supplier_name: string;
  emoji: string;
};

function mapProduct(row: Record<string, unknown>): Product {
  const status = String(row.status ?? 'pending') as Product['status'];
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    case_cost: Number(row.case_cost ?? 0),
    weight_lbs: Number(row.weight_lbs ?? 0),
    price_per_lb: Number(row.price_per_lb ?? 0),
    status: status === 'approved' || status === 'live' ? status : 'pending',
    supplier_name: String(row.supplier_name ?? ''),
    emoji: String(row.emoji ?? '📦'),
  };
}

const STATUS_COLORS = {
  pending:  { bg: '#fef9e7', text: '#d97706' },
  approved: { bg: '#e8f4fd', text: '#1a6fb5' },
  live:     { bg: '#e8f5e9', text: '#2e7d32' },
};

export default function SupplierPage() {
  const [screen, setScreen]   = useState<Screen>('home');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function loadProducts() {
    setFetching(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('supplier_products')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      setFetchError(error.message);
      setProducts([]);
    } else {
      setProducts((data || []).map((row) => mapProduct(row as Record<string, unknown>)));
    }
    setFetching(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  // Application form
  const [app, setApp] = useState<Application>({ name: '', contact_name: '', contact_phone: '', contact_email: '', product_types: '', message: '' });

  // Add product form
  const [pName, setPName]     = useState('');
  const [pCategory, setPCategory] = useState('Seafood');
  const [pCaseCost, setPCaseCost] = useState('');
  const [pWeight, setPWeight] = useState('');
  const [pEmoji, setPEmoji]   = useState('🐟');

  const caseCost   = parseFloat(pCaseCost) || 0;
  const weight     = parseFloat(pWeight) || 0;
  const trueCost   = weight > 0 ? caseCost / weight : 0;
  const nassauPrice  = trueCost * 1.38;
  const androsPrice  = trueCost * 1.43;
  const onlinePrice  = trueCost * 1.25;
  const wholesale    = trueCost * 1.12;

  async function submitApplication(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await supabase.from('suppliers').insert([{ ...app, status: 'pending', applied_at: new Date().toISOString() }]);
    } catch { /* continue */ }
    setSubmitted(true);
    setLoading(false);
  }

  async function submitProduct(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const payload = {
      name: pName,
      category: pCategory,
      case_cost: caseCost,
      weight_lbs: weight,
      price_per_lb: parseFloat(nassauPrice.toFixed(2)),
      status: 'pending' as const,
      supplier_name: 'My Business',
      emoji: pEmoji,
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('supplier_products').insert([payload]);
    if (error) {
      alert(`Could not save product: ${error.message}`);
      setLoading(false);
      return;
    }
    setPName(''); setPCaseCost(''); setPWeight('');
    setScreen('portal');
    setLoading(false);
    await loadProducts();
  }

  async function approveProduct(id: string) {
    const { error } = await supabase
      .from('supplier_products')
      .update({ status: 'live' })
      .eq('id', id);
    if (error) {
      alert(`Could not approve: ${error.message}`);
      return;
    }
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, status: 'live' } : p));
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
            <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>Supplier Portal</div>
          </div>
          <button onClick={() => setScreen('admin')} style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#f4c842', border: 'none', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            Admin View
          </button>
        </div>
      </header>

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '32px 16px' }}>
        {/* Hero */}
        <div style={{ backgroundColor: '#1a2e5a', borderRadius: '20px', padding: '32px', marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚢</div>
          <h1 style={{ color: '#fff', fontWeight: 900, fontSize: '26px', margin: '0 0 10px' }}>BSC Supplier Portal</h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '14px', margin: '0 0 24px', lineHeight: 1.6 }}>
            List your products on BSC Marketplace. Reach customers across Nassau & Andros. Get paid fast.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button onClick={() => setScreen('apply')} style={{ backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: '12px', padding: '14px', fontWeight: 900, fontSize: '15px', cursor: 'pointer' }}>
              Apply Now
            </button>
            <button onClick={() => setScreen('supplier-login')} style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '12px', padding: '14px', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}>
              Supplier Login
            </button>
          </div>
        </div>

        {/* Benefits */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { emoji: '🐟', title: 'List Products', desc: 'Upload seafood, meats, produce and more in minutes.' },
            { emoji: '💬', title: 'WhatsApp Updates', desc: 'Real-time order notifications via WhatsApp.' },
            { emoji: '💰', title: 'Get Paid Fast', desc: 'Transparent pricing, prompt payouts.' },
          ].map((b) => (
            <div key={b.title} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '18px 14px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{b.emoji}</div>
              <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '13px', marginBottom: '4px' }}>{b.title}</div>
              <div style={{ color: '#888', fontSize: '11px', lineHeight: 1.5 }}>{b.desc}</div>
            </div>
          ))}
        </div>

        {/* Spiny Tails section */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '16px', marginBottom: '4px' }}>🦞 Spiny Tails — BSC Internal</div>
            <div style={{ color: '#666', fontSize: '13px' }}>Cold storage. Direct-to-market. No approval needed.</div>
          </div>
          <button onClick={() => setScreen('spiny-tails')} style={{ backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '10px', padding: '10px 16px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Open →
          </button>
        </div>
      </div>
    </div>
  );

  /* ── APPLY ── */
  if (screen === 'apply') return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '56px' }}>
          <button onClick={() => setScreen('home')} style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>
            ← Back
          </button>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>Supplier Application</div>
        </div>
      </header>

      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '24px 16px' }}>
        {submitted ? (
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '40px 24px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '22px', marginBottom: '8px' }}>Application Submitted!</h2>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '24px', lineHeight: 1.6 }}>
              {"We'll review your application and contact you via WhatsApp within 24 hours."}
            </p>
            <a
              href="https://wa.me/12425584495?text=Hi BSC! I just submitted a supplier application."
              target="_blank"
              rel="noreferrer"
              style={{ display: 'block', backgroundColor: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: '12px', padding: '13px', fontWeight: 800, fontSize: '14px', marginBottom: '10px' }}
            >
              💬 WhatsApp BSC: +1 (242) 558-4495
            </a>
            <button onClick={() => setScreen('home')} style={{ width: '100%', backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '12px', padding: '13px', fontWeight: 900, fontSize: '14px', cursor: 'pointer' }}>
              Back to Home
            </button>
          </div>
        ) : (
          <form onSubmit={submitApplication}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '15px', marginBottom: '16px' }}>Business Information</h3>
              {[
                { label: 'Business Name', key: 'name', placeholder: 'Your business name', type: 'text' },
                { label: 'Contact Name', key: 'contact_name', placeholder: 'Your full name', type: 'text' },
                { label: 'WhatsApp Number', key: 'contact_phone', placeholder: '+1 (242) 000-0000', type: 'tel' },
                { label: 'Email', key: 'contact_email', placeholder: 'you@example.com', type: 'email' },
                { label: 'Product Types', key: 'product_types', placeholder: 'e.g. Seafood, Meats, Produce', type: 'text' },
              ].map((f) => (
                <div key={f.key} style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>{f.label}</label>
                  <input
                    type={f.type}
                    value={app[f.key as keyof Application]}
                    onChange={(e) => setApp((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    required
                    style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
              <div style={{ marginBottom: '6px' }}>
                <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Message (optional)</label>
                <textarea
                  value={app.message}
                  onChange={(e) => setApp((prev) => ({ ...prev, message: e.target.value }))}
                  placeholder="Tell us about your products..."
                  rows={3}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', backgroundColor: loading ? '#e5e7eb' : '#f4c842', color: loading ? '#999' : '#1a2e5a', border: 'none', borderRadius: '14px', padding: '16px', fontWeight: 900, fontSize: '16px', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Submitting...' : 'Submit Application'}
            </button>
          </form>
        )}
      </div>
    </div>
  );

  /* ── SUPPLIER LOGIN ── */
  if (screen === 'supplier-login') return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '56px' }}>
          <button onClick={() => setScreen('home')} style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>← Back</button>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>Supplier Login</div>
        </div>
      </header>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
        <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.10)' }}>
          <div style={{ backgroundColor: '#1a2e5a', padding: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>🚢</div>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: '18px' }}>Supplier Portal</div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '13px', marginTop: '4px' }}>Access your product dashboard</div>
          </div>
          <div style={{ padding: '28px' }}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Email</label>
              <input type="email" placeholder="supplier@example.com" style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Password</label>
              <input type="password" placeholder="••••••••" style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <button onClick={() => setScreen('portal')} style={{ width: '100%', backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: '12px', padding: '14px', fontWeight: 900, fontSize: '15px', cursor: 'pointer' }}>
              Sign In to Portal
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── SUPPLIER PORTAL ── */
  if (screen === 'portal') return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/dashboard" style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, textDecoration: 'none', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>
              ← BSC Control
            </Link>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>My Products</div>
          </div>
          <button onClick={() => setScreen('home')} style={{ backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
            + Add Product
          </button>
        </div>
      </header>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Live Products', value: products.filter((p) => p.status === 'live').length, color: '#e8f5e9', text: '#2e7d32' },
            { label: 'Pending Approval', value: products.filter((p) => p.status === 'pending').length, color: '#fef9e7', text: '#d97706' },
            { label: 'Total Products', value: products.length, color: '#e8f4fd', text: '#1a2e5a' },
          ].map((s) => (
            <div key={s.label} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '16px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ color: s.text, fontWeight: 900, fontSize: '28px' }}>{s.value}</div>
              <div style={{ color: '#999', fontSize: '12px', marginTop: '4px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Add product inline form */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '15px', marginBottom: '16px' }}>+ Upload New Product</h3>
          <form onSubmit={submitProduct}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Product Name</label>
                <input type="text" value={pName} onChange={(e) => setPName(e.target.value)} placeholder="e.g. Fresh Grouper" required style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Category</label>
                <select value={pCategory} onChange={(e) => setPCategory(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '13px', outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff' }}>
                  {['Seafood', 'Meats', 'Poultry', 'Produce', 'Groceries'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Case Cost ($)</label>
                <input type="number" value={pCaseCost} onChange={(e) => setPCaseCost(e.target.value)} placeholder="0.00" min="1" step="0.01" required style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Weight (lbs)</label>
                <input type="number" value={pWeight} onChange={(e) => setPWeight(e.target.value)} placeholder="0" min="1" step="0.1" required style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {caseCost > 0 && weight > 0 && (
              <div style={{ backgroundColor: '#f8f9fa', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
                <div style={{ color: '#999', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Channel Pricing Preview</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {[
                    { label: '🟡 Nassau (38%)',   value: nassauPrice },
                    { label: '🟣 Andros (43%)',   value: androsPrice },
                    { label: '🛒 Online (25%)',   value: onlinePrice },
                    { label: '📦 Wholesale (12%)', value: wholesale },
                  ].map((ch) => (
                    <div key={ch.label} style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#666', fontSize: '12px' }}>{ch.label}</span>
                      <span style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '13px' }}>${ch.value.toFixed(2)}/lb</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button type="submit" disabled={loading} style={{ width: '100%', backgroundColor: loading ? '#e5e7eb' : '#1a2e5a', color: loading ? '#999' : '#f4c842', border: 'none', borderRadius: '12px', padding: '12px', fontWeight: 900, fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </form>
        </div>

        {/* Product list */}
        <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '15px', marginBottom: '12px' }}>All Products</h3>
        {fetching && (
          <div style={{ color: '#999', fontSize: '13px', padding: '12px 0' }}>Loading products...</div>
        )}
        {!fetching && fetchError && (
          <div style={{
            backgroundColor: '#fde8e8', border: '1px solid #f5b5b5', borderRadius: '12px',
            padding: '14px', color: '#dc2626', fontSize: '13px', fontWeight: 600,
          }}>
            ⚠️ Could not load products: {fetchError}
          </div>
        )}
        {!fetching && !fetchError && products.length === 0 && (
          <div style={{
            backgroundColor: '#fff', borderRadius: '14px', padding: '24px',
            textAlign: 'center', color: '#999', fontSize: '13px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}>
            No products uploaded yet. Add your first one above.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {products.map((p) => {
            const sc = STATUS_COLORS[p.status];
            return (
              <div key={p.id} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontSize: '28px' }}>{p.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px' }}>{p.name}</div>
                  <div style={{ color: '#999', fontSize: '11px' }}>{p.category} · {p.supplier_name} · ${p.price_per_lb}/lb</div>
                </div>
                <span style={{ backgroundColor: sc.bg, color: sc.text, fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '20px', textTransform: 'capitalize' }}>
                  {p.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  /* ── ADMIN ── */
  if (screen === 'admin') return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setScreen('home')} style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>← Back</button>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>Admin · Supplier Products</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>{products.filter((p) => p.status === 'pending').length} pending approval</div>
            </div>
          </div>
          <Link href="/dashboard" style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>BSC Control →</Link>
        </div>
      </header>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {fetching && (
          <div style={{ color: '#999', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
            Loading supplier products...
          </div>
        )}
        {!fetching && fetchError && (
          <div style={{
            backgroundColor: '#fde8e8', border: '1px solid #f5b5b5', borderRadius: '12px',
            padding: '16px', color: '#dc2626', fontSize: '13px', fontWeight: 600,
          }}>
            ⚠️ Could not load products: {fetchError}
          </div>
        )}
        {!fetching && !fetchError && products.length === 0 && (
          <div style={{
            backgroundColor: '#fff', borderRadius: '14px', padding: '40px 20px',
            textAlign: 'center', color: '#999', fontSize: '13px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}>
            No supplier products in the system yet.
          </div>
        )}
        {products.map((p) => {
          const sc = STATUS_COLORS[p.status];
          return (
            <div key={p.id} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '28px' }}>{p.emoji}</div>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px' }}>{p.name}</div>
                <div style={{ color: '#999', fontSize: '11px' }}>{p.supplier_name} · {p.category} · ${p.price_per_lb}/lb · {p.weight_lbs}lbs</div>
              </div>
              <span style={{ backgroundColor: sc.bg, color: sc.text, fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '20px', textTransform: 'capitalize' }}>
                {p.status}
              </span>
              {p.status === 'pending' && (
                <button onClick={() => approveProduct(p.id)} style={{ backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
                  ✅ Approve & Go Live
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ── SPINY TAILS ── */
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setScreen('home')} style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>← Back</button>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>🦞 Spiny Tails — BSC Internal</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>Auto-approved · Goes live instantly</div>
            </div>
          </div>
        </div>
      </header>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ backgroundColor: '#1a2e5a', borderRadius: '16px', padding: '20px', marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {[
            { label: 'In Stock', value: '9,310 lbs', color: '#f4c842' },
            { label: 'Capacity', value: '30,000 lbs', color: 'rgba(255,255,255,0.7)' },
            { label: 'Available', value: '20,690 lbs', color: '#4ade80' },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ color: s.color, fontWeight: 900, fontSize: '18px' }}>{s.value}</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '15px', marginBottom: '16px' }}>Add Spiny Tails Product</h3>
          <p style={{ color: '#666', fontSize: '13px', marginBottom: '16px', lineHeight: 1.6 }}>
            Products added here go live instantly with no approval required. BSC internal use only.
          </p>
          <button onClick={() => setScreen('portal')} style={{ width: '100%', backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '12px', padding: '13px', fontWeight: 900, fontSize: '14px', cursor: 'pointer' }}>
            + Add Product to Market
          </button>
        </div>
      </div>
    </div>
  );
}