'use client';

// /vendor/listings/new — create a listing with 3-phase traceability media.
//
// Phases vary by vendor_type (lib/traceability/batch.ts). Each phase
// captures a media file (photo or video) AND the device GPS at upload
// time so the admin + processor can verify origin coordinates.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { phasesFor, captureGps, type PhaseDef, type VendorType } from '@/lib/traceability/batch';

const UNITS = ['lb','kg','each','case','dozen','bunch'];

interface PhaseUpload {
  phase_number: 1 | 2 | 3;
  phase_label:  string;
  media_type:   'photo' | 'video';
  media_url:    string;
  latitude:     number | null;
  longitude:    number | null;
  gps_accuracy_m: number | null;
  captured_at:  string | null;
}

export default function NewListingPage() {
  const [vendorId,   setVendorId]   = useState<string | null>(null);
  const [vendorType, setVendorType] = useState<VendorType | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [productType, setProductType] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [quantity,    setQuantity]    = useState('');
  const [unit,        setUnit]        = useState('lb');
  const [price,       setPrice]       = useState('');
  const [harvestStat, setHarvestStat] = useState<'ready_to_harvest' | 'harvested' | 'landing_soon'>('harvested');
  const [harvestAt,   setHarvestAt]   = useState('');
  const [dropoffAt,   setDropoffAt]   = useState('');
  const [bagsBoxes,   setBagsBoxes]   = useState('');
  const [bagBoxType,  setBagBoxType]  = useState('bag');

  const [phaseUploads, setPhaseUploads] = useState<Record<number, PhaseUpload | null>>({ 1: null, 2: null, 3: null });
  const [phaseBusy,    setPhaseBusy]    = useState<Record<number, boolean>>({});
  const phaseRefs      = useRef<Record<number, HTMLInputElement | null>>({});

  const [busy, setBusy] = useState(false);
  const [msg,  setMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/login?next=/vendor/listings/new'; return; }
      const { data: v } = await supabase.from('vendors').select('id, vendor_type, approval_status').eq('user_id', session.user.id).maybeSingle();
      if (!v) { window.location.href = '/vendor/signup'; return; }
      if (v.approval_status !== 'approved') { window.location.href = '/vendor/dashboard'; return; }
      setVendorId(v.id);
      setVendorType(v.vendor_type as VendorType);
      setAuthChecked(true);
    })();
  }, []);

  async function uploadPhaseMedia(p: PhaseDef, file: File) {
    if (!file) return;
    setPhaseBusy((b) => ({ ...b, [p.number]: true }));
    const isVideo = file.type.startsWith('video/');
    const media_type: 'photo' | 'video' = isVideo ? 'video' : 'photo';

    // 1) Try to capture GPS in parallel — best-effort.
    const gpsP = captureGps();

    // 2) Upload to vendor-listings public bucket under the vendor's folder.
    const { data: { user } } = await supabase.auth.getUser();
    const ext  = file.name.split('.').pop() ?? (isVideo ? 'mp4' : 'jpg');
    const path = `${user?.id ?? 'anon'}/traceability/phase${p.number}-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const { error } = await supabase.storage.from('vendor-listings').upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      alert(error.message);
      setPhaseBusy((b) => ({ ...b, [p.number]: false }));
      return;
    }
    const { data } = supabase.storage.from('vendor-listings').getPublicUrl(path);
    const gps = await gpsP;

    setPhaseUploads((prev) => ({
      ...prev,
      [p.number]: {
        phase_number:   p.number,
        phase_label:    p.key,
        media_type,
        media_url:      data.publicUrl,
        latitude:       gps?.latitude  ?? null,
        longitude:      gps?.longitude ?? null,
        gps_accuracy_m: gps?.accuracy_m ?? null,
        captured_at:    gps?.captured_at ?? null,
      },
    }));
    setPhaseBusy((b) => ({ ...b, [p.number]: false }));
  }

  async function submit() {
    setMsg(null);
    if (!vendorId)             { setMsg({ ok: false, text: 'No vendor record' }); return; }
    if (!title.trim())         { setMsg({ ok: false, text: 'Title required' }); return; }
    if (Number(quantity) <= 0) { setMsg({ ok: false, text: 'Quantity > 0' }); return; }
    if (Number(price)    <= 0) { setMsg({ ok: false, text: 'Price > 0' }); return; }
    const missingPhases = [1, 2, 3].filter((n) => !phaseUploads[n]);
    if (missingPhases.length > 0) {
      setMsg({ ok: false, text: `All 3 traceability phases required — missing ${missingPhases.map((n) => '#' + n).join(', ')}.` });
      return;
    }

    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = 'Bearer ' + session.access_token;
      const phases = [1, 2, 3].map((n) => phaseUploads[n]).filter(Boolean) as PhaseUpload[];
      const photos = phases.filter((p) => p.media_type === 'photo').map((p) => p.media_url);
      const videos = phases.filter((p) => p.media_type === 'video').map((p) => p.media_url);

      const res = await fetch('/api/vendor-listings/create', {
        method:  'POST',
        headers,
        body: JSON.stringify({
          vendor_id:             vendorId,
          title, description,
          product_type:          productType || null,
          scientific_name:       scientificName || null,
          quantity_available:    Number(quantity),
          unit,
          price_per_unit:        Number(price),
          harvest_status:        harvestStat,
          harvest_or_catch_time: harvestAt || null,
          dropoff_expected_at:   dropoffAt || null,
          bags_boxes:            bagsBoxes ? Number(bagsBoxes) : null,
          bag_box_type:          bagBoxType,
          photos, videos,
          phases,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setMsg({ ok: false, text: j.error || 'Submit failed' }); return; }
      setMsg({ ok: true, text: 'Listing + traceability submitted. Admin will approve + generate batch number.' });
      setTimeout(() => { window.location.href = '/vendor/dashboard'; }, 1800);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Submit failed' });
    } finally {
      setBusy(false);
    }
  }

  if (!authChecked || !vendorType) return <div style={pg}>Loading…</div>;
  const phases = phasesFor(vendorType);

  return (
    <div style={pg}>
      <header style={{ background: '#060d1f', color: '#fff', padding: '14px 16px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Link href="/vendor/dashboard" style={{ color: '#f5c518', fontSize: 12, textDecoration: 'none' }}>← Dashboard</Link>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0' }}>New listing</h1>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}>
        <Section title="What are you selling?">
          <Field label="Title *"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={vendorType === 'fisherman' ? 'e.g. Fresh Hogfish, today\'s catch' : 'e.g. Sun Ripe Tomatoes — 25 lb box'} style={inp} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Product type"><input value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="e.g. hogfish · tomato" style={inp} /></Field>
            <Field label="Scientific name"><input value={scientificName} onChange={(e) => setScientificName(e.target.value)} placeholder="e.g. Lachnolaimus maximus" style={inp} /></Field>
          </div>
          <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inp, fontFamily: 'inherit' }} /></Field>
        </Section>

        <Section title="Quantity + price">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 8 }}>
            <Field label="Quantity *"><input type="number" inputMode="decimal" step="0.01" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inp} /></Field>
            <Field label="Unit *">
              <select value={unit} onChange={(e) => setUnit(e.target.value)} style={inp}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Price / unit *"><input type="number" inputMode="decimal" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="BSD" style={inp} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Bags / boxes count"><input type="number" inputMode="numeric" min="0" value={bagsBoxes} onChange={(e) => setBagsBoxes(e.target.value)} placeholder="e.g. 12" style={inp} /></Field>
            <Field label="Bag or box?">
              <select value={bagBoxType} onChange={(e) => setBagBoxType(e.target.value)} style={inp}>
                <option value="bag">bag</option><option value="box">box</option><option value="crate">crate</option><option value="each">each</option>
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Harvest / catch timing">
          <Field label="Status">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
              {(['ready_to_harvest','harvested','landing_soon'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setHarvestStat(s)}
                  style={{ ...pill, background: harvestStat === s ? '#060d1f' : '#fff', color: harvestStat === s ? '#f5c518' : '#0F1111', borderColor: harvestStat === s ? '#f5c518' : '#d5d9d9' }}>
                  {s.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Catch / harvest time"><input type="datetime-local" value={harvestAt} onChange={(e) => setHarvestAt(e.target.value)} style={inp} /></Field>
          <Field label="Dropoff at Spiny Tail (expected)"><input type="datetime-local" value={dropoffAt} onChange={(e) => setDropoffAt(e.target.value)} style={inp} /></Field>
        </Section>

        <Section title="Traceability — 3 phases">
          <p style={{ fontSize: 11, color: '#565959', marginBottom: 10 }}>Each phase captures a photo or video plus your device GPS at upload time. Required for admin approval.</p>
          {phases.map((p) => {
            const u = phaseUploads[p.number];
            const busy = phaseBusy[p.number];
            return (
              <div key={p.number} style={{ padding: 12, borderRadius: 10, border: '1px solid #d5d9d9', marginBottom: 10, background: u ? '#e6f5ec' : '#f7f8f8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 18 }}>{p.emoji}</span>
                  <strong style={{ fontSize: 14, color: '#0F1111' }}>Phase {p.number} · {p.title}</strong>
                  {u && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#0a6b2f', fontWeight: 700 }}>✓ uploaded</span>}
                </div>
                <p style={{ fontSize: 11, color: '#565959', marginBottom: 8 }}>{p.hint}</p>

                {u ? (
                  <div style={{ fontSize: 11, color: '#0F1111' }}>
                    <a href={u.media_url} target="_blank" rel="noopener noreferrer" style={{ color: '#007185' }}>open {u.media_type}</a>
                    {u.latitude != null && u.longitude != null
                      ? <> · GPS {u.latitude.toFixed(5)}, {u.longitude.toFixed(5)} (±{u.gps_accuracy_m?.toFixed(0) ?? '?'}m)</>
                      : <> · <em style={{ color: '#9b1c1c' }}>no GPS captured — re-upload with location enabled</em></>}
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={() => phaseRefs.current[p.number]?.click()} disabled={busy} style={btn}>
                      {busy ? 'Uploading…' : '📸 Capture photo or video'}
                    </button>
                    <input
                      ref={(el) => { phaseRefs.current[p.number] = el; }}
                      type="file" accept="image/*,video/*" capture="environment"
                      style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhaseMedia(p, f); if (e.target) e.target.value = ''; }}
                    />
                  </>
                )}
              </div>
            );
          })}
        </Section>

        {msg && <div style={{ padding: 12, borderRadius: 10, background: msg.ok ? '#e7f7ec' : '#fce4e4', color: msg.ok ? '#0a6b2f' : '#9b1c1c', fontSize: 14, marginBottom: 10 }}>{msg.text}</div>}

        <button onClick={submit} disabled={busy} style={{ ...cta, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Submitting…' : 'Submit for approval'}
        </button>
      </main>
    </div>
  );
}

const pg: React.CSSProperties  = { minHeight: '100vh', background: '#f4f2ee', fontFamily: "'DM Sans', sans-serif", color: '#0F1111' };
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d5d9d9', fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
const pill: React.CSSProperties = { padding: '10px 6px', borderRadius: 10, fontSize: 12, fontWeight: 700, border: '2px solid #d5d9d9', cursor: 'pointer' };
const btn: React.CSSProperties = { padding: '10px 16px', borderRadius: 10, background: '#060d1f', color: '#f5c518', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const cta: React.CSSProperties = { width: '100%', padding: '14px 16px', borderRadius: 12, background: '#f5c518', color: '#060d1f', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #e7e7e7', marginBottom: 14 }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: '#060d1f', marginBottom: 10 }}>{title}</h2>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#565959', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
