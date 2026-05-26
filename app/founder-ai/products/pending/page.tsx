'use client';

// /founder-ai/products/pending
//
// Review-and-approve queue for child products created by the Founder AI's
// explode_product tool. Each child lands here with all sell_* flags off
// (the "pending" state) — this page lets the founder edit the name +
// per-channel price + portion fields, then click ✓ Approve to flip the
// product live for sale on its proposed channels.
//
// The proposed channels for each child are inferred from its
// product_pricing rows: every row whose channel is in the retail set
// represents an "intended" channel the AI suggested. Approve flips the
// matching sell_<channel> flag on so /market and the POS catalog pick it up.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import GpsBadge from '@/components/intake/GpsBadge';
import type { PhotoGeoMeta } from '@/lib/founder-ai/capture-gps';

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);

interface Pending {
  id:                  string;
  sku:                 string;
  name:                string;
  category:            string | null;
  unit_of_measure:     string | null;
  parent_product_id:   string | null;
  parent_sku:          string | null;
  parent_name:         string | null;
  portion_size:        number | null;
  portion_unit:        string | null;
  portions_per_parent: number | null;
  cost_per_unit:       number | null;
  vat_category:        string;
  channels:            Array<{ pricing_id: string; channel: string; price: number }>;
  created_at:          string;
  // Hydrated from product_intake_log when this product has a submission row.
  submitted_by_role:   string | null;
  photo_urls:          string[];
  photo_geos:          PhotoGeoMeta[];
}

const CHANNEL_FLAG: Record<string, 'sell_nassau' | 'sell_andros' | 'sell_online' | 'sell_wholesale'> = {
  nassau_pos:    'sell_nassau',
  andros_pos:    'sell_andros',
  online_retail: 'sell_online',
  online_market: 'sell_online',
  wholesale:     'sell_wholesale',
  local_wholesale: 'sell_wholesale',
};

export default function PendingProductsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Pending[]>([]);
  const [err,   setErr]   = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<Pending>>>({});
  const [priceEdits, setPriceEdits] = useState<Record<string, number>>({});  // pricing_id → new price
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/founder-ai/products/pending'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    // Pending = ALL sell_* flags off. This catches: explode_product children,
    // lobster-grade publishes from /spinytails/lots/<code>, and AI photo-intake
    // submissions — anything created without channels-on is considered awaiting
    // founder review here.
    const { data: prods, error } = await supabase
      .from('products')
      .select('id, sku, name, category, unit_of_measure, parent_product_id, portion_size, portion_unit, portions_per_parent, vat_category, created_at')
      .eq('sell_nassau', false)
      .eq('sell_andros', false)
      .eq('sell_online', false)
      .eq('sell_wholesale', false)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (error) { setErr(error.message); setLoading(false); return; }
    const rows = prods ?? [];
    if (rows.length === 0) { setItems([]); setLoading(false); return; }

    // Side-load parents
    const parentIds = Array.from(new Set(rows.map(r => r.parent_product_id).filter(Boolean) as string[]));
    const { data: parents } = await supabase.from('products').select('id, sku, name').in('id', parentIds);
    const pmap = new Map<string, { sku: string; name: string }>();
    for (const p of (parents ?? []) as Array<{ id: string; sku: string; name: string }>) pmap.set(p.id, { sku: p.sku, name: p.name });

    // Side-load costs
    const childIds = rows.map(r => r.id);
    const { data: costs } = await supabase
      .from('product_costs')
      .select('product_id, cost_per_unit')
      .eq('is_current', true)
      .in('product_id', childIds);
    const cmap = new Map<string, number>();
    for (const c of (costs ?? []) as Array<{ product_id: string; cost_per_unit: number }>) cmap.set(c.product_id, Number(c.cost_per_unit));

    // Side-load pricing rows (intended channels)
    const { data: pricing } = await supabase
      .from('product_pricing')
      .select('id, product_id, channel, manual_unit_price')
      .eq('is_current', true)
      .in('product_id', childIds);
    const pmap2 = new Map<string, Array<{ pricing_id: string; channel: string; price: number }>>();
    for (const pr of (pricing ?? []) as Array<{ id: string; product_id: string; channel: string; manual_unit_price: number | null }>) {
      const arr = pmap2.get(pr.product_id) ?? [];
      arr.push({ pricing_id: pr.id, channel: pr.channel, price: Number(pr.manual_unit_price ?? 0) });
      pmap2.set(pr.product_id, arr);
    }

    // Side-fetch product_intake_log entries for these pending products
    // so the queue shows role badge + GPS pin + extra photos per card.
    const { data: intakeRows } = await supabase
      .from('product_intake_log')
      .select('product_id, submitted_by_role, photo_urls, photo_geo')
      .in('product_id', childIds)
      .eq('status', 'pending');
    const intakeMap = new Map<string, { role: string | null; urls: string[]; geos: PhotoGeoMeta[] }>();
    for (const r of (intakeRows ?? []) as Array<{ product_id: string | null; submitted_by_role: string | null; photo_urls: string[] | null; photo_geo: PhotoGeoMeta[] | null }>) {
      if (!r.product_id) continue;
      intakeMap.set(r.product_id, {
        role: r.submitted_by_role,
        urls: Array.isArray(r.photo_urls) ? r.photo_urls : [],
        geos: Array.isArray(r.photo_geo) ? r.photo_geo : [],
      });
    }

    const built: Pending[] = rows.map(r => {
      const intake = intakeMap.get(r.id);
      return {
        id:                  r.id,
        sku:                 r.sku,
        name:                r.name,
        category:            r.category,
        unit_of_measure:     r.unit_of_measure,
        parent_product_id:   r.parent_product_id,
        parent_sku:          r.parent_product_id ? pmap.get(r.parent_product_id)?.sku ?? null : null,
        parent_name:         r.parent_product_id ? pmap.get(r.parent_product_id)?.name ?? null : null,
        portion_size:        r.portion_size,
        portion_unit:        r.portion_unit,
        portions_per_parent: r.portions_per_parent,
        cost_per_unit:       cmap.get(r.id) ?? null,
        vat_category:        (r as { vat_category?: string | null }).vat_category ?? 'uncooked_food',
        channels:            pmap2.get(r.id) ?? [],
        created_at:          r.created_at,
        submitted_by_role:   intake?.role ?? null,
        photo_urls:          intake?.urls ?? [],
        photo_geos:          intake?.geos ?? [],
      };
    });
    setItems(built);
    setLoading(false);
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 5000);
  }

  async function approve(p: Pending) {
    setBusy(b => ({ ...b, [p.id]: true }));
    try {
      // 1. Save any edits to name + portion fields.
      const e = edits[p.id] ?? {};
      const updates: Record<string, unknown> = {};
      if (typeof e.name === 'string' && e.name.trim() && e.name !== p.name) updates.name = e.name.trim();
      if (typeof e.portion_size === 'number' && e.portion_size !== p.portion_size) updates.portion_size = e.portion_size;
      if (typeof e.portion_unit === 'string' && e.portion_unit && e.portion_unit !== p.portion_unit) updates.portion_unit = e.portion_unit.toLowerCase();
      if (typeof e.portions_per_parent === 'number' && e.portions_per_parent !== p.portions_per_parent) updates.portions_per_parent = e.portions_per_parent;
      if (typeof e.vat_category === 'string' && e.vat_category !== p.vat_category) updates.vat_category = e.vat_category;

      // 2. Flip the channel flags ON for channels that have a pricing row.
      const flags = new Set<string>();
      for (const ch of p.channels) {
        const flag = CHANNEL_FLAG[ch.channel];
        if (flag) flags.add(flag);
      }
      for (const flag of flags) updates[flag] = true;

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from('products').update(updates).eq('id', p.id);
        if (error) { showToast(false, `⚠ Update failed: ${error.message}`); return; }
      }

      // 3. Save any price edits — update manual_unit_price on existing pricing rows.
      for (const ch of p.channels) {
        const newPrice = priceEdits[ch.pricing_id];
        if (typeof newPrice === 'number' && newPrice > 0 && Math.abs(newPrice - ch.price) > 0.001) {
          const { error: prErr } = await supabase
            .from('product_pricing')
            .update({ manual_unit_price: newPrice })
            .eq('id', ch.pricing_id);
          if (prErr) { showToast(false, `⚠ Price update failed: ${prErr.message}`); return; }
        }
      }

      // Flip any related product_intake_log row(s) to approved + stamp approver.
      const { data: { session } } = await supabase.auth.getSession();
      await supabase
        .from('product_intake_log')
        .update({
          status:      'approved',
          approved_at: new Date().toISOString(),
          approved_by: session?.user?.id ?? null,
        })
        .eq('product_id', p.id)
        .eq('status', 'pending');

      showToast(true, `✓ Approved & published: ${p.sku}`);
      await load();
    } finally {
      setBusy(b => ({ ...b, [p.id]: false }));
    }
  }

  async function discard(p: Pending) {
    if (!confirm(`Discard pending product ${p.sku}? This deletes the child row + its cost + pricing.`)) return;
    setBusy(b => ({ ...b, [p.id]: true }));
    try {
      await supabase.from('product_pricing').delete().eq('product_id', p.id);
      await supabase.from('product_costs').delete().eq('product_id', p.id);
      const { error } = await supabase.from('products').delete().eq('id', p.id);
      if (error) { showToast(false, `⚠ Discard failed: ${error.message}`); return; }
      showToast(true, `🗑 Discarded ${p.sku}`);
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
          <Link href="/founder-ai" style={back}>← Founder AI</Link>
          <h1 style={h1}>🧪 Pending products — review & approve</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Children created by <code>explode_product</code> land here in pending state.
            Edit name / portion / per-channel prices, then ✓ Approve to flip live.
            {items.length > 0 && ` · ${items.length} pending`}
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
        {err && <div style={errBox}>⚠ {err}</div>}
        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && items.length === 0 && (
          <div style={emptyBox}>
            <div style={{ fontSize: 32 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#4ade80', marginTop: 6 }}>Nothing pending</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
              Ask the Founder AI: <em>&quot;take SKU &lt;sku&gt; and sell it as 5 × 2lb bags&quot;</em>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {items.map(p => {
            const e = edits[p.id] ?? {};
            const editName = e.name ?? p.name;
            const editSize = e.portion_size ?? p.portion_size ?? 0;
            const editUnit = e.portion_unit ?? p.portion_unit ?? '';
            const editPp   = e.portions_per_parent ?? p.portions_per_parent ?? 0;
            return (
              <div key={p.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#f5c518', fontWeight: 800 }}>{p.sku}</div>
                    {p.submitted_by_role && (
                      <span style={{ background: 'rgba(96,165,250,0.18)', color: '#60a5fa', border: '1px solid #60a5fa', borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 800, letterSpacing: 0.4 }}>
                        ROLE: {p.submitted_by_role}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    {p.parent_sku
                      ? <>parent: <Link href={`/dashboard/products/${encodeURIComponent(p.parent_sku)}`} style={{ color: '#60a5fa' }}>{p.parent_sku}</Link>{p.parent_name && <span> · {p.parent_name}</span>}</>
                      : <span style={{ color: 'rgba(255,255,255,0.4)' }}>(standalone)</span>}
                  </div>
                </div>

                {/* Photos + per-photo GPS (when product_intake_log has data) */}
                {p.photo_urls.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {p.photo_urls.map((url, i) => {
                      const geo = p.photo_geos[i];
                      const hasCoord = geo && geo.latitude != null && geo.longitude != null;
                      const mapUrl = hasCoord ? `https://maps.google.com/?q=${geo.latitude},${geo.longitude}` : null;
                      return (
                        <div key={i} style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(245,197,24,0.2)' }}>
                          <img src={url} alt={`photo ${i + 1}`} style={{ width: 90, height: 90, objectFit: 'cover', display: 'block' }} />
                          <div style={{ position: 'absolute', bottom: 2, left: 2, display: 'flex', gap: 2 }}>
                            {geo && <GpsBadge geo={geo} />}
                          </div>
                          {mapUrl && (
                            <a href={mapUrl} target="_blank" rel="noreferrer"
                              style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: '#4ade80', borderRadius: 4, padding: '1px 5px', fontSize: 9, textDecoration: 'none', fontWeight: 800 }}
                              title={`Open ${geo!.latitude!.toFixed(4)}, ${geo!.longitude!.toFixed(4)} in Google Maps`}>
                              📍 map
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <label style={lbl}>Name</label>
                <input type="text" value={editName}
                  onChange={ev => setEdits(s => ({ ...s, [p.id]: { ...s[p.id], name: ev.target.value } }))}
                  style={inp} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                  <div>
                    <label style={lbl}>Portion size</label>
                    <input type="number" step="0.001" inputMode="decimal" value={editSize}
                      onChange={ev => setEdits(s => ({ ...s, [p.id]: { ...s[p.id], portion_size: parseFloat(ev.target.value) } }))}
                      style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Unit</label>
                    <select value={editUnit}
                      onChange={ev => setEdits(s => ({ ...s, [p.id]: { ...s[p.id], portion_unit: ev.target.value } }))}
                      style={inp}>
                      <option value="lb">lb</option>
                      <option value="oz">oz</option>
                      <option value="each">each</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Per parent</label>
                    <input type="number" step="1" value={editPp}
                      onChange={ev => setEdits(s => ({ ...s, [p.id]: { ...s[p.id], portions_per_parent: parseInt(ev.target.value || '0', 10) } }))}
                      style={inp} />
                  </div>
                </div>

                {/* VAT category — confirm before approving. Default
                    is uncooked_food (0% VAT); flip to cooked_prepared
                    only when the product is juice-bar / kitchen-prepped. */}
                <label style={lbl}>VAT category (Bahamas law)</label>
                <select
                  value={(edits[p.id]?.vat_category as string | undefined) ?? p.vat_category}
                  onChange={ev => setEdits(s => ({ ...s, [p.id]: { ...s[p.id], vat_category: ev.target.value as Pending['vat_category'] } }))}
                  style={inp}>
                  <option value="uncooked_food">Uncooked food — 0% VAT (raw seafood, frozen, produce, grocery)</option>
                  <option value="cooked_prepared">Cooked / prepared — 10% VAT (juice bar, kitchen)</option>
                  <option value="service">Service — 0% VAT</option>
                </select>

                <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                  Derived cost per unit: <strong style={{ color: '#fff' }}>${(p.cost_per_unit ?? 0).toFixed(2)}</strong> · proposed channels:
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 6 }}>
                  {p.channels.map(ch => (
                    <div key={ch.pricing_id} style={channelCell}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{ch.channel}</div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
                        <span style={{ color: '#f5c518', fontSize: 11 }}>$</span>
                        <input
                          type="number" step="0.01" inputMode="decimal"
                          defaultValue={ch.price.toFixed(2)}
                          onChange={ev => setPriceEdits(s => ({ ...s, [ch.pricing_id]: parseFloat(ev.target.value || '0') }))}
                          style={{ ...inp, fontSize: 15, fontWeight: 800, padding: '4px 8px', width: 90 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                  <button onClick={() => discard(p)} disabled={busy[p.id]}
                    style={btnRed(busy[p.id])}>🗑 Discard</button>
                  <button onClick={() => approve(p)} disabled={busy[p.id]}
                    style={btnGreen(busy[p.id])}>✓ Approve & publish</button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const errBox: React.CSSProperties = { padding: 14, background: 'rgba(248,113,113,0.15)', border: '1px solid #f87171', color: '#f87171', borderRadius: 8, marginBottom: 16 };
const emptyBox: React.CSSProperties = { marginTop: 24, padding: 32, textAlign: 'center', background: 'rgba(74,222,128,0.08)', border: '1px solid #16a34a', borderRadius: 12 };
const card: React.CSSProperties = { background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 10, padding: 14 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 4 };
const inp: React.CSSProperties = { background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const channelCell: React.CSSProperties = { background: '#060d1f', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 6, padding: '6px 8px' };
const btnGreen = (b: boolean): React.CSSProperties => ({ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: b ? 0.5 : 1 });
const btnRed   = (b: boolean): React.CSSProperties => ({ background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid #f87171', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: b ? 0.5 : 1 });
