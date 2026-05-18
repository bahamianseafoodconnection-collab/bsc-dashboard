'use client';

// /vendor/dashboard — vendor's own dashboard.
// Status badge, pending vs live listings, sales + payouts summary.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Vendor {
  id:                       string;
  business_name:            string;
  vendor_type:              string;
  approval_status:          'pending' | 'approved' | 'suspended' | 'rejected';
  trust_tier:               number;
  total_listings:           number;
  total_sales:              number;
  total_payouts:            number;
  quality_rejections_count: number;
}

interface Listing {
  id:                  string;
  title:               string;
  status:              string;
  quantity_available:  number;
  unit:                string;
  price_per_unit:      number;
  created_at:          string;
}

export default function VendorDashboardPage() {
  const [vendor,   setVendor]   = useState<Vendor | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/login?next=/vendor/dashboard'; return; }
      const { data: v, error: vErr } = await supabase.from('vendors').select('*').eq('user_id', session.user.id).maybeSingle();
      if (vErr) { setErr(vErr.message); setLoading(false); return; }
      if (!v)   { setErr('No vendor record found. Apply at /vendor/signup.'); setLoading(false); return; }
      setVendor(v as Vendor);
      const { data: ls } = await supabase.from('vendor_listings')
        .select('id, title, status, quantity_available, unit, price_per_unit, created_at')
        .eq('vendor_id', v.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setListings((ls ?? []) as Listing[]);
      setLoading(false);
    })();
  }, []);

  const statusColors: Record<Vendor['approval_status'], { bg: string; fg: string; label: string }> = {
    pending:   { bg: '#fff8e1', fg: '#7a5c00', label: 'Pending Review' },
    approved:  { bg: '#e6f5ec', fg: '#0a6b2f', label: '✓ Approved' },
    suspended: { bg: '#fce4e4', fg: '#9b1c1c', label: 'Suspended' },
    rejected:  { bg: '#fce4e4', fg: '#9b1c1c', label: 'Rejected' },
  };

  if (loading) return <div style={pg}>Loading…</div>;
  if (err)     return <div style={pg}><p style={{ color: '#dc2626' }}>{err}</p><p><Link href="/vendor/signup">Apply →</Link></p></div>;
  if (!vendor) return null;

  const sc = statusColors[vendor.approval_status];
  const live    = listings.filter((l) => l.status === 'live').length;
  const pending = listings.filter((l) => l.status === 'pending_approval').length;

  return (
    <div style={pg}>
      <header style={{ background: '#060d1f', color: '#fff', padding: '18px 16px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Link href="/" style={{ color: '#f5c518', fontSize: 12, textDecoration: 'none' }}>← bscbahamas.com</Link>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' }}>
            {vendor.business_name}
          </h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ background: sc.bg, color: sc.fg, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{sc.label}</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Tier {vendor.trust_tier} · {vendor.vendor_type}</span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
        {vendor.approval_status === 'pending' && (
          <Card>
            <p>Your application is under review by Dedrick or Jaquel. You'll get a call or message when you're approved — usually within 24 hours.</p>
          </Card>
        )}
        {vendor.approval_status === 'rejected' && (
          <Card>
            <p style={{ color: '#9b1c1c' }}>Your application wasn't approved. Reach out at <a href="https://wa.me/12423613474" style={{ color: '#007185' }}>WhatsApp +1 (242) 361-3474</a> to discuss.</p>
          </Card>
        )}
        {vendor.approval_status === 'suspended' && (
          <Card>
            <p style={{ color: '#9b1c1c' }}>Your account is suspended. Contact Dedrick to discuss reinstating.</p>
          </Card>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
          <Stat label="Live listings"  value={String(live)} />
          <Stat label="Pending review" value={String(pending)} color="#7a5c00" />
          <Stat label="Total sales"    value={`$${Number(vendor.total_sales).toFixed(2)}`} />
          <Stat label="Total payouts"  value={`$${Number(vendor.total_payouts).toFixed(2)}`} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {vendor.approval_status === 'approved' && (
            <Link href="/vendor/listings/new" style={cta}>+ New listing</Link>
          )}
        </div>

        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: '#060d1f', margin: '12px 0 8px' }}>Your listings</h2>
        {listings.length === 0 && <p style={{ color: '#565959', fontSize: 14 }}>None yet.</p>}
        {listings.map((l) => (
          <article key={l.id} style={{ background: '#fff', border: '1px solid #e7e7e7', borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontWeight: 700 }}>{l.title}</span>
              <span style={{ fontSize: 11, color: l.status === 'live' ? '#0a6b2f' : l.status === 'pending_approval' ? '#7a5c00' : '#565959', fontWeight: 700, textTransform: 'uppercase' }}>{l.status.replace(/_/g,' ')}</span>
            </div>
            <p style={{ fontSize: 12, color: '#565959', marginTop: 4 }}>
              {Number(l.quantity_available).toFixed(0)} {l.unit} @ BSD ${Number(l.price_per_unit).toFixed(2)}/{l.unit} · {new Date(l.created_at).toLocaleDateString()}
            </p>
          </article>
        ))}
      </main>
    </div>
  );
}

const pg: React.CSSProperties  = { minHeight: '100vh', background: '#f4f2ee', fontFamily: "'DM Sans', sans-serif", color: '#0F1111' };
const cta: React.CSSProperties = { display: 'inline-block', background: '#f5c518', color: '#060d1f', padding: '10px 16px', borderRadius: 10, fontWeight: 800, textDecoration: 'none', fontSize: 14 };

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#fff', border: '1px solid #e7e7e7', borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 14, lineHeight: 1.6 }}>{children}</div>;
}
function Stat({ label, value, color = '#060d1f' }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e7e7e7', borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 10, color: '#565959', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}
