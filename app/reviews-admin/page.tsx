'use client';

// app/reviews-admin/page.tsx
//
// Staff console for moderating customer product reviews. Shows every
// review across all products with quick approve / reject / delete
// actions. Routed at /reviews-admin to leave room for a future
// customer-facing /reviews destination.
//
// Inline styles to match the rest of the back-office UI.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';

export const dynamic = 'force-dynamic';

type Review = {
  id: string;
  created_at: string;
  product_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  author_name: string;
  status: 'approved' | 'pending' | 'rejected';
  is_verified_purchase: boolean;
  product?: { id: string; name: string } | null;
};

type Filter = 'all' | 'approved' | 'pending' | 'rejected';

export default function ReviewsAdminPage() {
  const [rows, setRows] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('product_reviews')
      .select(`
        id, created_at, product_id, rating, title, body, author_name,
        status, is_verified_purchase,
        product:products ( id, name )
      `)
      .order('created_at', { ascending: false })
      .limit(500);
    if (err) {
      setError(plainError(err));
      setRows([]);
    } else {
      const normalized = ((data || []) as unknown as Array<Omit<Review, 'product'> & {
        product: { id: string; name: string } | { id: string; name: string }[] | null;
      }>).map((r) => ({
        ...r,
        product: Array.isArray(r.product) ? r.product[0] ?? null : r.product,
      }));
      setRows(normalized as Review[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function setStatus(r: Review, status: 'approved' | 'pending' | 'rejected') {
    setBusyId(r.id);
    await supabase
      .from('product_reviews')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', r.id);
    setBusyId(null);
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status } : x)));
  }

  async function deleteReview(r: Review) {
    if (!confirm('Delete this review permanently?')) return;
    setBusyId(r.id);
    await supabase.from('product_reviews').delete().eq('id', r.id);
    setBusyId(null);
    setRows((rs) => rs.filter((x) => x.id !== r.id));
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = [
          r.author_name, r.title, r.body, r.product?.name,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { approved: 0, pending: 0, rejected: 0 };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>

      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0, marginBottom: 6 }}>
        Customer reviews
      </h1>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
        Approve, hide, or delete what shows on each product page.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 12 }}>
        <Stat label="Approved" value={counts.approved} accent="#22c55e" />
        <Stat label="Pending"  value={counts.pending}  accent="#f5c518" />
        <Stat label="Rejected" value={counts.rejected} accent="#f87171" />
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10 }}>
        {(['all', 'approved', 'pending', 'rejected'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...filterPillStyle,
              background: filter === f ? '#f5c518' : '#0d1f3c',
              color: filter === f ? '#060d1f' : '#cbd5e1',
              border: filter === f ? 'none' : '1px solid #1e3a5f',
            }}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && ` (${counts[f] || 0})`}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by product, author, or text…"
        style={inputStyle}
      />

      {error && <ErrorBox text={error} migration="sql/2026-05-09-reviews-wishlist.sql" />}

      {loading && <div style={{ color: '#94a3b8', padding: 12 }}>Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ color: '#94a3b8', padding: 12, textAlign: 'center' }}>
          {rows.length === 0 ? 'No reviews yet.' : 'No reviews match those filters.'}
        </div>
      )}

      {filtered.map((r) => {
        const tone =
          r.status === 'approved' ? '#22c55e' :
          r.status === 'rejected' ? '#f87171' :
          '#f5c518';
        return (
          <div key={r.id} style={{ ...cardStyle, borderLeft: `4px solid ${tone}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                  {r.product ? (
                    <Link href={`/product/${r.product.id}`} style={{ color: '#f5c518', textDecoration: 'none' }}>
                      {r.product.name}
                    </Link>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>(deleted product)</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} · {r.author_name}
                  {r.is_verified_purchase && ' · ✓ Verified'}
                  {' · '}{r.created_at.slice(0, 16).replace('T', ' ')}
                </div>
              </div>
              <span style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800, padding: '4px 8px', borderRadius: 999, color: '#060d1f', background: tone }}>
                {r.status}
              </span>
            </div>
            {r.title && (
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 6, fontWeight: 700 }}>
                {r.title}
              </div>
            )}
            {r.body && (
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                {r.body}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {r.status !== 'approved' && (
                <button onClick={() => setStatus(r, 'approved')} disabled={busyId === r.id} style={miniBtn('#22c55e')}>
                  Approve
                </button>
              )}
              {r.status !== 'rejected' && (
                <button onClick={() => setStatus(r, 'rejected')} disabled={busyId === r.id} style={miniBtn('#f87171')}>
                  Hide
                </button>
              )}
              {r.status !== 'pending' && (
                <button onClick={() => setStatus(r, 'pending')} disabled={busyId === r.id} style={miniBtn('#f5c518')}>
                  Mark pending
                </button>
              )}
              <button onClick={() => deleteReview(r)} disabled={busyId === r.id} style={miniBtn('#94a3b8')}>
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: accent || '#f5c518', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ErrorBox({ text, migration }: { text: string; migration?: string }) {
  return (
    <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
      ⚠️ {text}
      {migration && (text.toLowerCase().includes('relation') || text.toLowerCase().includes('does not exist')) && (
        <div style={{ marginTop: 6 }}>Run {migration} in the Supabase SQL editor.</div>
      )}
    </div>
  );
}

function miniBtn(color: string): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${color}`,
    color,
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  };
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 720, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '12px 14px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const filterPillStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
