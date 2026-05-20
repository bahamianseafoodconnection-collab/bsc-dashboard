'use client';

// /dashboard/specials
//
// Schedule "closed date" product specials — pick any product, set a
// special_price + window (special_starts_at / special_ends_at) +
// optional label, and the product shows in the 🔥 Specials section on
// /market while the window is open. After the closed date passes,
// the product reverts to its regular channel price automatically (no
// follow-up flip needed).
//
// Three time windows surface as pills:
//   • Active     — NOW() is between starts and ends
//   • Scheduled  — starts in the future
//   • Expired    — ended in the past
// Any product with sell_online=true can be scheduled.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);

interface Product {
  id:                 string;
  sku:                string;
  name:               string;
  category:           string | null;
  sell_online:        boolean;
  image_url:          string | null;
  regular_price:      number | null;
  special_price:      number | null;
  special_starts_at:  string | null;
  special_ends_at:    string | null;
  special_label:      string | null;
}

type Status = 'active' | 'scheduled' | 'expired' | 'none';

function statusOf(p: Product, now = new Date()): Status {
  if (!p.special_price) return 'none';
  const start = p.special_starts_at ? new Date(p.special_starts_at) : null;
  const end   = p.special_ends_at   ? new Date(p.special_ends_at)   : null;
  if (start && start > now) return 'scheduled';
  if (end   && end   < now) return 'expired';
  return 'active';
}

const statusStyle: Record<Status, { bg: string; fg: string; label: string }> = {
  active:    { bg: 'rgba(74,222,128,0.18)',  fg: '#4ade80', label: 'ACTIVE' },
  scheduled: { bg: 'rgba(251,191,36,0.18)',  fg: '#fbbf24', label: 'SCHEDULED' },
  expired:   { bg: 'rgba(148,163,184,0.18)', fg: '#94a3b8', label: 'EXPIRED' },
  none:      { bg: 'transparent',            fg: '#94a3b8', label: '—' },
};

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  // Format yyyy-MM-ddTHH:mm for <input type="datetime-local">
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(s: string): string | null {
  if (!s) return null;
  return new Date(s).toISOString();
}

export default function SpecialsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'scheduled' | 'expired' | 'none'>('all');
  const [edits, setEdits] = useState<Record<string, Partial<Product>>>({});
  const [busy,  setBusy]  = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/specials'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: prods } = await supabase
      .from('products')
      .select('id, sku, name, category, sell_online, image_url, special_price, special_starts_at, special_ends_at, special_label')
      .eq('status', 'active')
      .eq('sell_online', true)
      .order('name');

    // Regular online price per product
    const { data: prices } = await supabase
      .from('product_pricing')
      .select('product_id, manual_unit_price')
      .eq('channel', 'online_market')
      .eq('is_current', true);
    const priceMap = new Map<string, number>();
    for (const r of (prices ?? []) as Array<{ product_id: string; manual_unit_price: number | null }>) {
      if (r.manual_unit_price != null) priceMap.set(r.product_id, Number(r.manual_unit_price));
    }

    const built: Product[] = (prods ?? []).map((p): Product => ({
      id:                 p.id,
      sku:                p.sku,
      name:               p.name,
      category:           p.category,
      sell_online:        !!p.sell_online,
      image_url:          p.image_url ?? null,
      regular_price:      priceMap.get(p.id) ?? null,
      special_price:      p.special_price != null ? Number(p.special_price) : null,
      special_starts_at:  p.special_starts_at,
      special_ends_at:    p.special_ends_at,
      special_label:      p.special_label,
    }));
    setProducts(built);
    setLoading(false);
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
      if (filter === 'all') return true;
      return statusOf(p) === filter;
    });
  }, [products, search, filter]);

  const counts = useMemo(() => {
    return products.reduce((acc, p) => {
      const s = statusOf(p);
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {} as Record<Status, number>);
  }, [products]);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 5000);
  }

  function patch(id: string, key: keyof Product, value: unknown) {
    setEdits(s => ({ ...s, [id]: { ...s[id], [key]: value } }));
  }

  async function save(p: Product) {
    setBusy(b => ({ ...b, [p.id]: true }));
    try {
      const e = edits[p.id] ?? {};
      const next = {
        special_price:     e.special_price !== undefined ? e.special_price : p.special_price,
        special_starts_at: e.special_starts_at !== undefined ? e.special_starts_at : p.special_starts_at,
        special_ends_at:   e.special_ends_at !== undefined ? e.special_ends_at : p.special_ends_at,
        special_label:     e.special_label !== undefined ? e.special_label : p.special_label,
      };
      const { error } = await supabase.from('products').update(next).eq('id', p.id);
      if (error) { showToast(false, `⚠ ${error.message}`); return; }
      showToast(true, `✓ Saved ${p.sku}`);
      setEdits(s => { const { [p.id]: _, ...rest } = s; return rest; });
      await load();
    } finally {
      setBusy(b => ({ ...b, [p.id]: false }));
    }
  }

  async function clearSpecial(p: Product) {
    if (!confirm(`Clear special on ${p.sku}? The product reverts to its regular channel price.`)) return;
    setBusy(b => ({ ...b, [p.id]: true }));
    try {
      const { error } = await supabase.from('products').update({
        special_price: null, special_starts_at: null, special_ends_at: null, special_label: null,
      }).eq('id', p.id);
      if (error) { showToast(false, `⚠ ${error.message}`); return; }
      showToast(true, `✓ Cleared special on ${p.sku}`);
      await load();
    } finally {
      setBusy(b => ({ ...b, [p.id]: false }));
    }
  }

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>🔥 Specials — closed-date promotions</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Schedule time-bound prices on any online product. While the window is open, the special shows in the 🔥 Specials section on <Link href="/market" style={{ color: '#f5c518' }}>/market</Link> and customers buy at the special price. After the closed date, the regular price returns automatically.
          </p>
          {toast && (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: toast.ok ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
              color:      toast.ok ? '#4ade80' : '#f87171',
              border:    `1px solid ${toast.ok ? '#16a34a' : '#f87171'}` }}>
              {toast.msg}
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            type="search" placeholder="Search by SKU or name…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inp, flex: '1 1 240px', maxWidth: 360 }}
          />
          {(['all','active','scheduled','expired','none'] as const).map(k => (
            <button key={k} onClick={() => setFilter(k)} style={chip(filter === k)}>
              {k === 'all' ? `All (${products.length})` : `${k} (${counts[k as Status] ?? 0})`}
            </button>
          ))}
        </div>

        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && filtered.length === 0 && (
          <div style={emptyBox}>
            <div style={{ fontSize: 32 }}>🔥</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f5c518', marginTop: 6 }}>No matching products</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Adjust search or filter, or approve more products at <Link href="/founder-ai/products/pending" style={{ color: '#4ade80' }}>/founder-ai/products/pending</Link>.</div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map(p => {
            const status = statusOf(p);
            const sty = statusStyle[status];
            const e = edits[p.id] ?? {};
            const editPrice = e.special_price !== undefined ? e.special_price : p.special_price;
            const editStart = e.special_starts_at !== undefined ? e.special_starts_at : p.special_starts_at;
            const editEnd   = e.special_ends_at   !== undefined ? e.special_ends_at   : p.special_ends_at;
            const editLabel = e.special_label !== undefined ? e.special_label : p.special_label;
            const dirty = Object.keys(e).length > 0;
            return (
              <div key={p.id} style={card}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, flex: '0 0 64px' }} />
                    : <div style={{ width: 64, height: 64, background: '#060d1f', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 64px', fontSize: 24 }}>🛒</div>}
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <strong style={{ color: '#fff', fontSize: 14 }}>{p.name}</strong>
                      {status !== 'none' && (
                        <span style={{ background: sty.bg, color: sty.fg, border: `1px solid ${sty.fg}`, borderRadius: 12, padding: '2px 8px', fontSize: 9, fontWeight: 900, letterSpacing: 0.5 }}>{sty.label}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, fontFamily: 'monospace' }}>{p.sku}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
                      Regular online: <strong style={{ color: '#fff' }}>{p.regular_price != null ? `$${p.regular_price.toFixed(2)}` : '—'}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 10 }}>
                  <div>
                    <label style={lbl}>Special price (BSD)</label>
                    <input type="number" step="0.01" min="0"
                      value={editPrice ?? ''}
                      onChange={ev => patch(p.id, 'special_price', ev.target.value ? parseFloat(ev.target.value) : null)}
                      placeholder="(none)" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Starts at</label>
                    <input type="datetime-local"
                      value={toLocalInput(editStart ?? null)}
                      onChange={ev => patch(p.id, 'special_starts_at', fromLocalInput(ev.target.value))}
                      style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Closed date (ends at)</label>
                    <input type="datetime-local"
                      value={toLocalInput(editEnd ?? null)}
                      onChange={ev => patch(p.id, 'special_ends_at', fromLocalInput(ev.target.value))}
                      style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Label (optional)</label>
                    <input type="text"
                      value={editLabel ?? ''}
                      onChange={ev => patch(p.id, 'special_label', ev.target.value || null)}
                      placeholder='e.g. "Saturday Only"' style={inp} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                  {p.special_price != null && (
                    <button onClick={() => clearSpecial(p)} disabled={busy[p.id]}
                      style={btnGhost(busy[p.id])}>🗑 Clear special</button>
                  )}
                  <button onClick={() => save(p)} disabled={busy[p.id] || !dirty}
                    style={btnGreen(busy[p.id] || !dirty)}>
                    {busy[p.id] ? 'Saving…' : (dirty ? '✓ Save' : 'No changes')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 18, lineHeight: 1.5 }}>
          Start / closed dates are stored in your timezone and converted to UTC. Leave <em>starts at</em> blank to go live immediately, leave <em>closed date</em> blank for open-ended.
        </p>
      </main>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const card: React.CSSProperties = { background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 10, padding: 14 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 };
const inp: React.CSSProperties = { background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const emptyBox: React.CSSProperties = { padding: 32, textAlign: 'center', background: 'rgba(245,197,24,0.05)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 };
const chip = (active: boolean): React.CSSProperties => ({
  background: active ? '#f5c518' : 'rgba(245,197,24,0.12)',
  color: active ? '#060d1f' : '#f5c518',
  border: '1px solid #f5c518',
  borderRadius: 16, padding: '4px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
});
const btnGreen = (disabled: boolean): React.CSSProperties => ({
  background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px',
  fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: disabled ? 0.5 : 1,
});
const btnGhost = (disabled: boolean): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8, padding: '8px 12px', fontSize: 12, cursor: 'pointer', opacity: disabled ? 0.5 : 1,
});
