'use client';

// /dashboard/listings/pending — admin queue for vendor listings.
//
// Shows all 3 traceability phases (with GPS map links) before approval.
// "Approve & generate batch" flips status='live', generates a batch
// number via the SQL function generate_batch_number(vendor_type), and
// writes a traceability_batches row that gets routed to Spiny Tail.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { gmapsLink } from '@/lib/traceability/batch';
import { suggestProfile } from '@/lib/traceability/product-packaging';

interface ListingRow {
  id: string; vendor_id: string; title: string; description: string | null; product_type: string | null;
  quantity_available: number; unit: string; price_per_unit: number;
  harvest_status: string | null; harvest_or_catch_time: string | null;
  available_until: string | null; photos: string[]; videos: string[];
  dropoff_expected_at: string | null; rejection_reason: string | null; created_at: string;
}
interface VendorMini {
  id: string; business_name: string; vendor_type: string; trust_tier: number; phone: string | null;
  vessel_name: string | null; vessel_registration: string | null; captain_name: string | null;
  vessel_owner_name: string | null; vessel_registration_doc_url: string | null;
  farm_name: string | null; farm_license_number: string | null; farm_license_doc_url: string | null;
  farmer_id_doc_url: string | null;
}
interface PhaseRow {
  id: string; listing_id: string; phase_number: number; phase_label: string;
  media_type: 'photo' | 'video'; media_url: string;
  latitude: number | null; longitude: number | null; gps_accuracy_m: number | null;
  captured_at: string | null;
}

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','manager','basic_admin']);

const DEFAULT_SHELF_LIFE: Record<string, number> = {
  fisherman: 5,      // fresh seafood: 5 days
  farmer:    7,      // produce: 7 days
  other:     14,
};

export default function PendingListingsPage() {
  const [rows,    setRows]    = useState<ListingRow[]>([]);
  const [vendors, setVendors] = useState<Record<string, VendorMini>>({});
  const [phases,  setPhases]  = useState<Record<string, PhaseRow[]>>({});   // by listing_id
  const [loading, setLoading] = useState(true);
  const [authed,  setAuthed]  = useState<boolean | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [shelfLife, setShelfLife] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/listings/pending'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await load();
      setLoading(false);
    })();
  }, []);

  async function load() {
    const { data } = await supabase.from('vendor_listings')
      .select('*').eq('status', 'pending_approval').order('created_at', { ascending: false });
    const list = (data ?? []) as ListingRow[];
    setRows(list);
    if (list.length === 0) return;

    const vids = Array.from(new Set(list.map((l) => l.vendor_id)));
    const lids = list.map((l) => l.id);

    const [{ data: vs }, { data: ps }] = await Promise.all([
      supabase.from('vendors').select('*').in('id', vids),
      supabase.from('traceability_phases').select('*').in('listing_id', lids),
    ]);
    const vMap: Record<string, VendorMini> = {};
    for (const v of (vs ?? []) as VendorMini[]) vMap[v.id] = v;
    setVendors(vMap);

    const pMap: Record<string, PhaseRow[]> = {};
    for (const p of (ps ?? []) as PhaseRow[]) {
      (pMap[p.listing_id] ||= []).push(p);
    }
    for (const k of Object.keys(pMap)) pMap[k].sort((a, b) => a.phase_number - b.phase_number);
    setPhases(pMap);
  }

  async function approveAndGenerateBatch(l: ListingRow) {
    const { data: { session } } = await supabase.auth.getSession();
    const v = vendors[l.vendor_id];
    if (!v) { alert('Vendor not loaded'); return; }
    const sl = Number(shelfLife[l.id] ?? DEFAULT_SHELF_LIFE[v.vendor_type] ?? 7);

    // 1) Generate batch number + lot code via RPCs.
    const [bnRes, lcRes] = await Promise.all([
      supabase.rpc('generate_batch_number', { p_vendor_type: v.vendor_type }),
      supabase.rpc('generate_lot_code'),
    ]);
    if (bnRes.error || !bnRes.data) { alert('Batch number generation failed: ' + (bnRes.error?.message ?? 'unknown')); return; }
    if (lcRes.error || !lcRes.data) { alert('Lot code generation failed: '   + (lcRes.error?.message ?? 'unknown')); return; }
    const batchNumber: string = bnRes.data as string;
    const lotCode:     string = lcRes.data as string;

    // 2) Parse meta from rejection_reason (until we add a JSONB column).
    let meta: Record<string, unknown> = {};
    try { if (l.rejection_reason) meta = JSON.parse(l.rejection_reason) as Record<string, unknown>; } catch { /* */ }

    // 3) Pull label defaults from the product-packaging lookup.
    const profile     = suggestProfile(l.product_type ?? l.title);
    const ingredients = profile?.key === 'lobster_tail' ? 'Lobster Tails, Sodium Bisulfite added as a Preservative'
                      : profile?.key === 'conch'        ? 'Conch, Salt'
                      : profile?.key === 'farm_crop'    ? (l.product_type ?? l.title)
                      : (l.product_type ?? l.title);
    const allergens   = (profile?.key === 'lobster_tail' || profile?.key === 'conch')
                          ? 'Contains shellfish.'
                          : v.vendor_type === 'fisherman' ? 'Contains fish.' : null;

    // 4) Insert traceability_batches row with vendor-context snapshot.
    const isFisher = v.vendor_type === 'fisherman';
    const isFarmer = v.vendor_type === 'farmer';
    const payoutSnapshot = Number(l.price_per_unit) * Number(l.quantity_available);

    const { error: bErr } = await supabase.from('traceability_batches').insert({
      batch_number:             batchNumber,
      lot_code:                 lotCode,
      listing_id:               l.id,
      vendor_id:                v.id,
      vendor_type:              v.vendor_type,
      product_name:             l.product_type ?? l.title,
      scientific_name:          (meta.scientific_name as string | null) ?? null,
      quantity_units:           (meta.bags_boxes as number | null) ?? null,
      quantity_unit_type:       (meta.bag_box_type as string | null) ?? null,
      vendor_payout_snapshot:   Number(payoutSnapshot.toFixed(2)),
      vessel_name:              isFisher ? v.vessel_name              : null,
      vessel_registration:      isFisher ? v.vessel_registration      : null,
      captain_name:             isFisher ? v.captain_name             : null,
      vessel_owner_name:        isFisher ? v.vessel_owner_name        : null,
      vessel_registration_doc_url: isFisher ? v.vessel_registration_doc_url : null,
      farm_name:                isFarmer ? v.farm_name                : null,
      farm_license_number:      isFarmer ? v.farm_license_number      : null,
      farm_license_doc_url:     isFarmer ? v.farm_license_doc_url     : null,
      farmer_id_doc_url:        isFarmer ? v.farmer_id_doc_url        : null,
      // Label defaults — match the Spiny Tails Co. reference sticker.
      fda_number:               '16988725790',
      processing_plant_number:  '45',
      ingredients,
      allergens,
      cook_disclaimer:          'Cook fully before consumption.',
      wild_caught:              isFisher,
      master_case_lbs:          profile?.master_case_lbs ?? null,
      package_lbs:              profile?.package_lbs     ?? null,
      shelf_life_days:          sl || profile?.shelf_life_days || 7,
      status:                   'pending_processing',
      approved_by:              session?.user.id ?? null,
      approved_at:              new Date().toISOString(),
      sent_to_processing_at:    new Date().toISOString(),
    });
    if (bErr) { alert('Batch insert failed: ' + bErr.message); return; }

    // 4) Flip listing to live.
    await supabase.from('vendor_listings').update({
      status:      'live',
      approved_by: session?.user.id ?? null,
      approved_at: new Date().toISOString(),
    }).eq('id', l.id);

    // 5) Tell Spiny Tail.
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = 'Bearer ' + session.access_token;
      await fetch('/api/notifications/multi-channel', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          channels: ['email','sms','dashboard'],
          emails:   (process.env.NEXT_PUBLIC_SPINY_TAIL_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          phones:   (process.env.NEXT_PUBLIC_SPINY_TAIL_PHONES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          title:    `New batch incoming: ${batchNumber}`,
          body:     `${v.business_name}: ${l.quantity_available} ${l.unit} of ${l.title}. Receive at /dashboard/processing-batches`,
          url:      'https://bscbahamas.com/dashboard/processing-batches',
          urgent:   true,
          relatedId: l.id,
          relatedType: 'traceability_batch',
        }),
      });
    } catch { /* notify is best-effort */ }

    alert(`✓ Batch ${batchNumber} created. Listing is live.`);
    await load();
  }

  async function reject(id: string) {
    const r = reasons[id]?.trim() || 'Did not meet BSC quality standards.';
    await supabase.from('vendor_listings').update({ status: 'rejected', rejection_reason: r }).eq('id', id);
    await load();
  }

  if (authed === null) return <div style={pg}>Loading…</div>;
  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>📝 Listing approvals + traceability</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{rows.length} listing{rows.length === 1 ? '' : 's'} waiting</p>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && rows.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 }}>No pending listings 🎉</div>}

        {rows.map((l) => {
          const v   = vendors[l.vendor_id];
          const ps  = phases[l.id] ?? [];
          const sl  = shelfLife[l.id] ?? String(DEFAULT_SHELF_LIFE[v?.vendor_type ?? 'other'] ?? 7);
          const canApprove = ps.length >= 3;
          return (
            <article key={l.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{l.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    {v ? `${v.business_name} · ${v.vendor_type} · Tier ${v.trust_tier}` : '(vendor)'} · submitted {new Date(l.created_at).toLocaleString()}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#f5c518' }}>BSD ${Number(l.price_per_unit).toFixed(2)}/{l.unit}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{Number(l.quantity_available).toFixed(0)} {l.unit} available</div>
                </div>
              </div>

              {l.description && <p style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{l.description}</p>}

              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
                {l.harvest_status && <>Status: <strong>{l.harvest_status.replace(/_/g,' ')}</strong> · </>}
                {l.harvest_or_catch_time && <>Catch/harvest: {new Date(l.harvest_or_catch_time).toLocaleString()} · </>}
                {l.dropoff_expected_at && <>Spiny Tail dropoff: {new Date(l.dropoff_expected_at).toLocaleString()}</>}
              </div>

              <div style={{ marginTop: 12, padding: 10, background: '#0b1628', borderRadius: 8 }}>
                <p style={{ fontSize: 10, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
                  Traceability — {ps.length}/3 phases uploaded
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 6 }}>
                  {[1, 2, 3].map((n) => {
                    const p = ps.find((x) => x.phase_number === n);
                    if (!p) return <div key={n} style={{ padding: 8, background: 'rgba(220,38,38,0.1)', color: '#f87171', borderRadius: 6, fontSize: 11 }}>Phase {n}: missing</div>;
                    const map = gmapsLink(p.latitude, p.longitude);
                    return (
                      <div key={n} style={{ padding: 8, background: 'rgba(22,163,74,0.1)', borderRadius: 6, fontSize: 11 }}>
                        <div style={{ fontWeight: 700, color: '#4ade80', marginBottom: 4 }}>Phase {n}: {p.phase_label.replace(/_/g,' ')}</div>
                        <a href={p.media_url} target="_blank" rel="noopener noreferrer" style={{ color: '#f5c518', textDecoration: 'underline' }}>
                          {p.media_type === 'video' ? '🎥 view video' : '📷 view photo'}
                        </a>
                        {map && <> · <a href={map} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>📍 GPS</a></>}
                        {p.latitude != null && <div style={{ marginTop: 3, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{p.latitude.toFixed(5)}, {p.longitude?.toFixed(5)}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 11, color: '#f5c518', fontWeight: 700, letterSpacing: 0.5 }}>
                  Shelf life (days)
                  <input type="number" min="1" value={sl}
                    onChange={(e) => setShelfLife((s) => ({ ...s, [l.id]: e.target.value }))}
                    style={{ marginLeft: 6, width: 70, padding: '6px 8px', borderRadius: 6, background: '#1a2e5a', color: '#fff', border: '1px solid rgba(245,197,24,0.25)' }} />
                </label>
              </div>

              <div style={{ marginTop: 10 }}>
                <textarea value={reasons[l.id] ?? ''} onChange={(e) => setReasons((r) => ({ ...r, [l.id]: e.target.value }))}
                  rows={2} placeholder="Rejection reason (only used if you click ✕ Reject)"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: '#1a2e5a', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 13, fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <button onClick={() => approveAndGenerateBatch(l)} disabled={!canApprove} style={{ ...act, background: canApprove ? '#16a34a' : '#3a3a3a', cursor: canApprove ? 'pointer' : 'not-allowed' }}>
                  ✓ Approve & generate batch
                </button>
                <button onClick={() => reject(l.id)}  style={{ ...act, background: '#dc2626' }}>✕ Reject</button>
                {v?.phone && <a href={`https://wa.me/${v.phone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" style={{ ...act, background: '#25d366', textDecoration: 'none', display: 'inline-block' }}>💬 WhatsApp vendor</a>}
              </div>
              {!canApprove && <p style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>Vendor must upload all 3 traceability phases before this can be approved.</p>}
            </article>
          );
        })}
      </main>
    </div>
  );
}

const pg: React.CSSProperties   = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif" };
const hdr: React.CSSProperties  = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties   = { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const card: React.CSSProperties = { background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 10 };
const act: React.CSSProperties  = { color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
