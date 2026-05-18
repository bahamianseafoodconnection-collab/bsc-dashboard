'use client';

// Shared marketplace component used by /shop/fresh-catch and /shop/farm-fresh.
// Pulls vendor_listings WHERE status='live' AND vendor.vendor_type=kind.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Listing {
  id: string; vendor_id: string; title: string; description: string | null;
  product_type: string | null; quantity_available: number; unit: string;
  price_per_unit: number; photos: string[]; videos: string[];
  harvest_status: string | null; harvest_or_catch_time: string | null; available_until: string | null;
}
interface Vendor { id: string; business_name: string; vendor_type: string; trust_tier: number; location: string | null; }

export default function VendorMarketShop({ kind }: { kind: 'fisherman' | 'farmer' }) {
  const [items,   setItems]   = useState<Array<Listing & { vendor: Vendor | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);
  const [q,       setQ]       = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: vs, error: vErr } = await supabase.from('vendors')
        .select('id, business_name, vendor_type, trust_tier, location')
        .eq('approval_status', 'approved')
        .eq('vendor_type', kind);
      if (vErr) { setErr(vErr.message); setLoading(false); return; }
      const vendors = (vs ?? []) as Vendor[];
      const vMap = new Map(vendors.map((v) => [v.id, v]));
      if (vendors.length === 0) { setItems([]); setLoading(false); return; }

      const { data: ls } = await supabase.from('vendor_listings')
        .select('*').eq('status', 'live').in('vendor_id', vendors.map((v) => v.id))
        .order('created_at', { ascending: false }).limit(120);
      if (cancelled) return;
      const merged = ((ls ?? []) as Listing[]).map((l) => ({ ...l, vendor: vMap.get(l.vendor_id) ?? null }));
      setItems(merged);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [kind]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter((i) =>
      i.title.toLowerCase().includes(s) ||
      (i.product_type ?? '').toLowerCase().includes(s) ||
      (i.vendor?.business_name ?? '').toLowerCase().includes(s)
    );
  }, [items, q]);

  const kicker = kind === 'fisherman' ? 'Fresh Catch · Direct from Bahamian fishermen' : 'Farm Fresh · Direct from Bahamian farmers';
  const title  = kind === 'fisherman' ? '🐟 Fresh Catch' : '🌱 Farm Fresh';

  return (
    <div style={{ minHeight: '100vh', background: '#f4f2ee', fontFamily: "'DM Sans', sans-serif", color: '#0F1111' }}>
      <header style={{ background: '#060d1f', color: '#fff', padding: '16px 16px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/" style={{ color: '#f5c518', fontSize: 12, textDecoration: 'none' }}>← bscbahamas.com</Link>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: '#f5c518', margin: '4px 0' }}>{title}</h1>
          <p style={{ fontSize: 12, opacity: 0.7 }}>{kicker} · QC at Spiny Tail · Delivered by BSC.</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
            style={{ marginTop: 10, width: '100%', maxWidth: 480, padding: '10px 12px', borderRadius: 10, border: 'none', fontSize: 14, fontFamily: 'inherit' }} />
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        {err && <p style={{ color: '#9b1c1c' }}>⚠ {err}</p>}
        {loading && <p style={{ color: '#565959', textAlign: 'center', padding: 30 }}>Loading fresh listings…</p>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px solid #e7e7e7', color: '#565959' }}>
            <p style={{ fontSize: 16, fontWeight: 700 }}>{kind === 'fisherman' ? 'No fresh catch live right now' : 'No fresh harvest live right now'}.</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Check back later — our vendors post as catch / harvest lands.</p>
            <p style={{ fontSize: 13, marginTop: 10 }}>Are you a Bahamian {kind}? <Link href="/vendor/signup" style={{ color: '#007185', fontWeight: 700 }}>Sell with BSC →</Link></p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {filtered.map((l) => (
            <article key={l.id} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #e7e7e7' }}>
              {l.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.photos[0]} alt={l.title} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover' }} />
              ) : (
                <div style={{ aspectRatio: '4/3', background: '#1a2e5a', color: '#f5c518', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42 }}>{kind === 'fisherman' ? '🎣' : '🌱'}</div>
              )}
              <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#565959', marginBottom: 4 }}>
                  <span style={{ background: '#e6f5ec', color: '#0a6b2f', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>✓ BSC Approved</span>
                  <span>· {l.vendor?.business_name ?? 'BSC Vendor'}</span>
                </div>
                <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: '#0F1111', lineHeight: 1.2, marginTop: 4 }}>{l.title}</h3>
                {l.harvest_or_catch_time && <p style={{ fontSize: 11, color: '#565959', marginTop: 4 }}>{l.harvest_status?.replace(/_/g, ' ')} · {new Date(l.harvest_or_catch_time).toLocaleString()}</p>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#0F1111' }}>${Number(l.price_per_unit).toFixed(2)}<span style={{ fontSize: 11, color: '#565959', fontWeight: 500 }}>/{l.unit}</span></span>
                  <span style={{ fontSize: 11, color: '#565959' }}>{Number(l.quantity_available).toFixed(0)} {l.unit} left</span>
                </div>
                <a href={`https://wa.me/12423613474?text=${encodeURIComponent(`Reserve: ${l.title}`)}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', marginTop: 10, background: '#f5c518', color: '#060d1f', padding: '10px 14px', borderRadius: 10, fontWeight: 800, textAlign: 'center', textDecoration: 'none', fontSize: 13 }}>
                  Reserve via WhatsApp
                </a>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
