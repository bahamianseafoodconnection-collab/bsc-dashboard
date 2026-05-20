'use client';

// /vendor/dashboard — vendor's own dashboard.
// Status badge, pending vs live listings, sales + payouts summary, +
// self-serve vessel/farm info card so fishermen and farmers can update
// their own registration + upload the yearly renewal doc themselves
// instead of admin doing it on their behalf.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Vendor {
  id:                          string;
  business_name:               string;
  vendor_type:                 string;
  approval_status:             'pending' | 'approved' | 'suspended' | 'rejected';
  trust_tier:                  number;
  total_listings:              number;
  total_sales:                 number;
  total_payouts:               number;
  quality_rejections_count:    number;
  // Vessel (fisherman)
  vessel_name:                 string | null;
  vessel_registration:         string | null;
  captain_name:                string | null;
  vessel_owner_name:           string | null;
  vessel_registration_doc_url: string | null;
  // Farm (farmer)
  farm_name:                   string | null;
  farm_license_number:         string | null;
  farm_license_doc_url:        string | null;
  farmer_id_doc_url:           string | null;
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
  const [editOpen, setEditOpen] = useState(false);
  const [toast,    setToast]    = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
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
  }

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
        {toast && (
          <div style={{ background: '#e6f5ec', border: '1px solid #16a34a', color: '#0a6b2f', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
            {toast}
          </div>
        )}

        {vendor.approval_status === 'pending' && (
          <Card>
            <p>Your application is under review by Dedrick or Jaquel. You&rsquo;ll get a call or message when you&rsquo;re approved — usually within 24 hours.</p>
          </Card>
        )}
        {vendor.approval_status === 'rejected' && (
          <Card>
            <p style={{ color: '#9b1c1c' }}>Your application wasn&rsquo;t approved. Reach out at <a href="https://wa.me/12423613474" style={{ color: '#007185' }}>WhatsApp +1 (242) 361-3474</a> to discuss.</p>
          </Card>
        )}
        {vendor.approval_status === 'suspended' && (
          <Card>
            <p style={{ color: '#9b1c1c' }}>Your account is suspended. Contact Dedrick to discuss reinstating.</p>
          </Card>
        )}

        {/* Vessel / farm self-serve card — applies to fishermen + farmers */}
        {(vendor.vendor_type === 'fisherman' || vendor.vendor_type === 'farmer') && (
          <VesselFarmCard vendor={vendor} onEdit={() => setEditOpen(true)} />
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

      {editOpen && (
        <VesselFarmEditModal
          vendor={vendor}
          onClose={() => setEditOpen(false)}
          onSaved={async (msg) => { setEditOpen(false); setToast(msg); setTimeout(() => setToast(null), 5000); await load(); }}
        />
      )}
    </div>
  );
}

// ─── Vessel / farm card ─────────────────────────────────────────────
function VesselFarmCard({ vendor, onEdit }: { vendor: Vendor; onEdit: () => void }) {
  const isFisherman = vendor.vendor_type === 'fisherman';
  const isFarmer    = vendor.vendor_type === 'farmer';
  const hasDoc = isFisherman ? !!vendor.vessel_registration_doc_url : !!vendor.farm_license_doc_url;
  const docUrl = isFisherman ? vendor.vessel_registration_doc_url   : vendor.farm_license_doc_url;
  const primaryName = isFisherman ? (vendor.vessel_name ?? '— vessel name —') : (vendor.farm_name ?? '— farm name —');
  const regNum      = isFisherman ? vendor.vessel_registration : vendor.farm_license_number;

  return (
    <div style={{ background: '#fff', border: '1px solid #e7e7e7', borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <p style={lab}>{isFisherman ? '🛥 Vessel' : '🌱 Farm'} info</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#060d1f', margin: '2px 0 0' }}>{primaryName}</p>
          <p style={{ fontSize: 12, color: '#565959', marginTop: 2 }}>
            {regNum ? <>Registration <code style={{ background: '#fff8e1', padding: '1px 6px', borderRadius: 4, fontFamily: 'ui-monospace, Menlo, monospace' }}>{regNum}</code></> : <span style={{ color: '#c2410c' }}>⚠ No registration number on file</span>}
          </p>
        </div>
        <button onClick={onEdit}
          style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
          {hasDoc ? 'Update info' : 'Add info →'}
        </button>
      </div>

      {isFisherman && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 10 }}>
          <SmallStat label="Captain" value={vendor.captain_name ?? '—'} />
          <SmallStat label="Owner"   value={vendor.vessel_owner_name ?? '—'} />
        </div>
      )}

      <div style={{ background: hasDoc ? '#e6f5ec' : '#fff8e1', border: `1px solid ${hasDoc ? '#16a34a' : '#fbbf24'}`, borderRadius: 8, padding: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: hasDoc ? '#0a6b2f' : '#7a5c00', margin: 0 }}>
              {isFisherman ? '📜 Boat registration' : '📜 Farm license'} {hasDoc ? '· on file ✓' : '· upload required'}
            </p>
            <p style={{ fontSize: 12, color: '#1a2e5a', margin: '4px 0 0' }}>
              {hasDoc
                ? 'Government renewal accepted. Tap "Update info" to upload a new one when you renew next year.'
                : `Upload your current ${isFisherman ? 'boat registration' : 'farm license'} so BSC can verify and source from you.`}
            </p>
          </div>
          {hasDoc && docUrl && (
            <a href={docUrl} target="_blank" rel="noopener noreferrer"
              style={{ background: 'rgba(16,163,74,0.15)', color: '#0a6b2f', border: '1px solid #16a34a', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
              📄 View on file
            </a>
          )}
        </div>
      </div>

      {isFarmer && vendor.farmer_id_doc_url && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#565959' }}>
          🆔 Farmer government ID: <a href={vendor.farmer_id_doc_url} target="_blank" rel="noopener noreferrer" style={{ color: '#007185' }}>view</a>
        </div>
      )}
    </div>
  );
}

// ─── Edit modal — fisherman + farmer ────────────────────────────────
function VesselFarmEditModal({ vendor, onClose, onSaved }: { vendor: Vendor; onClose: () => void; onSaved: (msg: string) => Promise<void> }) {
  const isFisherman = vendor.vendor_type === 'fisherman';
  const isFarmer    = vendor.vendor_type === 'farmer';

  // Vessel state
  const [vesselName, setVesselName] = useState(vendor.vessel_name ?? '');
  const [vesselReg,  setVesselReg]  = useState(vendor.vessel_registration ?? '');
  const [captain,    setCaptain]    = useState(vendor.captain_name ?? '');
  const [owner,      setOwner]      = useState(vendor.vessel_owner_name ?? '');
  // Farm state
  const [farmName,  setFarmName]    = useState(vendor.farm_name ?? '');
  const [farmLic,   setFarmLic]     = useState(vendor.farm_license_number ?? '');
  // Files
  const [docFile,   setDocFile]     = useState<File | null>(null);
  const [farmerIdFile, setFarmerIdFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);

  async function uploadFile(file: File, label: string): Promise<string | null> {
    const ext  = file.name.split('.').pop() ?? 'pdf';
    const path = `vendors/${vendor.id}/${label}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('vendor-listings').upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from('vendor-listings').getPublicUrl(path);
    return pub.publicUrl;
  }

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const patch: Record<string, unknown> = {};

      if (isFisherman) {
        patch.vessel_name         = vesselName.trim() || null;
        patch.vessel_registration = vesselReg.trim()  || null;
        patch.captain_name        = captain.trim()    || null;
        patch.vessel_owner_name   = owner.trim()      || null;
        if (docFile) patch.vessel_registration_doc_url = await uploadFile(docFile, 'boat-registration');
      } else if (isFarmer) {
        patch.farm_name           = farmName.trim()   || null;
        patch.farm_license_number = farmLic.trim()    || null;
        if (docFile)       patch.farm_license_doc_url = await uploadFile(docFile, 'farm-license');
        if (farmerIdFile)  patch.farmer_id_doc_url    = await uploadFile(farmerIdFile, 'farmer-id');
      }

      const { error } = await supabase.from('vendors').update(patch).eq('id', vendor.id);
      if (error) throw error;
      await onSaved(`✓ ${isFisherman ? 'Vessel' : 'Farm'} info updated${docFile ? ' + document uploaded' : ''}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div style={modalBg} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={modalCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", color: '#060d1f', margin: 0, fontSize: 20 }}>
            {isFisherman ? '🛥 Vessel info' : '🌱 Farm info'}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', color: '#565959', border: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {isFisherman && (
          <>
            <Field label="Vessel name">
              <input value={vesselName} onChange={e => setVesselName(e.target.value)} placeholder="e.g. Sea Hunter" style={inp} />
            </Field>
            <Field label="Boat registration #">
              <input value={vesselReg} onChange={e => setVesselReg(e.target.value)} placeholder="e.g. BAH-12345" style={inp} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Captain name">
                <input value={captain} onChange={e => setCaptain(e.target.value)} placeholder="optional" style={inp} />
              </Field>
              <Field label="Boat owner">
                <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="if not yourself" style={inp} />
              </Field>
            </div>
          </>
        )}

        {isFarmer && (
          <>
            <Field label="Farm name">
              <input value={farmName} onChange={e => setFarmName(e.target.value)} placeholder="e.g. Andros Hilltop Farm" style={inp} />
            </Field>
            <Field label="Farm license #">
              <input value={farmLic} onChange={e => setFarmLic(e.target.value)} placeholder="govt license number" style={inp} />
            </Field>
          </>
        )}

        <Field label={isFisherman ? `📜 Boat registration (yearly renewal — PDF, image, or photo)` : `📜 Farm license (PDF, image, or photo)`}>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg"
            onChange={e => setDocFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 13, color: '#565959' }} />
          {!docFile && (isFisherman ? vendor.vessel_registration_doc_url : vendor.farm_license_doc_url) && (
            <p style={{ fontSize: 11, color: '#565959', marginTop: 4 }}>Already on file. Pick a new file only when renewing.</p>
          )}
        </Field>

        {isFarmer && (
          <Field label="🆔 Farmer government ID (optional, helps verify)">
            <input type="file" accept=".pdf,.png,.jpg,.jpeg"
              onChange={e => setFarmerIdFile(e.target.files?.[0] ?? null)}
              style={{ fontSize: 13, color: '#565959' }} />
            {!farmerIdFile && vendor.farmer_id_doc_url && (
              <p style={{ fontSize: 11, color: '#565959', marginTop: 4 }}>Already on file.</p>
            )}
          </Field>
        )}

        <p style={{ fontSize: 11, color: '#7a5c00', background: '#fff8e1', borderRadius: 6, padding: 8, margin: '8px 0' }}>
          ℹ {isFisherman
            ? 'Boat registration is issued yearly by the government. Upload your current renewal each year — BSC needs it on file before sourcing from your vessel.'
            : 'Farm license issued by the Department of Agriculture. Keep it current so BSC can source from your farm.'}
        </p>

        {err && <div style={{ background: '#fce4e4', border: '1px solid #f87171', color: '#9b1c1c', padding: 8, borderRadius: 8, fontSize: 12, marginBottom: 8 }}>⚠ {err}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ ...btn, background: '#e7e7e7', color: '#565959', flex: 1 }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ ...btn, background: '#f5c518', color: '#060d1f', flex: 2 }}>
            {busy ? 'Saving…' : '✓ Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const pg: React.CSSProperties  = { minHeight: '100vh', background: '#f4f2ee', fontFamily: "'DM Sans', sans-serif", color: '#0F1111' };
const cta: React.CSSProperties = { display: 'inline-block', background: '#f5c518', color: '#060d1f', padding: '10px 16px', borderRadius: 10, fontWeight: 800, textDecoration: 'none', fontSize: 14 };
const lab: React.CSSProperties = { fontSize: 10, color: '#565959', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, margin: 0 };
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#fff', color: '#0F1111', border: '1px solid #ccc', fontSize: 14, boxSizing: 'border-box' };
const btn: React.CSSProperties = { border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer' };
const modalBg: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16 };
const modalCard: React.CSSProperties = { background: '#fff', borderRadius: 14, padding: 16, maxWidth: 520, width: '100%', marginTop: 32, border: '1px solid #e7e7e7' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#565959', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}
function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f4f2ee', borderRadius: 8, padding: '6px 10px' }}>
      <div style={{ fontSize: 10, color: '#565959', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#060d1f', fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
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
