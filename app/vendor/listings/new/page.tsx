'use client';

// /vendor/listings/new — create a listing.
// Photos required; video required for fish + produce types. Submit
// goes into pending_approval queue.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const UNITS = ['lb','kg','each','case','dozen','bunch'];

export default function NewListingPage() {
  const [vendorId,   setVendorId]   = useState<string | null>(null);
  const [vendorType, setVendorType] = useState<'fisherman' | 'farmer' | 'other' | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [productType, setProductType] = useState('');
  const [quantity,    setQuantity]    = useState('');
  const [unit,        setUnit]        = useState('lb');
  const [price,       setPrice]       = useState('');
  const [harvestStat, setHarvestStat] = useState<'ready_to_harvest' | 'harvested' | 'landing_soon'>('harvested');
  const [harvestAt,   setHarvestAt]   = useState('');
  const [dropoffAt,   setDropoffAt]   = useState('');

  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [msg,  setMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/login?next=/vendor/listings/new'; return; }
      const { data: v } = await supabase.from('vendors').select('id, vendor_type, approval_status').eq('user_id', session.user.id).maybeSingle();
      if (!v) { window.location.href = '/vendor/signup'; return; }
      if (v.approval_status !== 'approved') { window.location.href = '/vendor/dashboard'; return; }
      setVendorId(v.id);
      setVendorType(v.vendor_type as 'fisherman' | 'farmer' | 'other');
      setAuthChecked(true);
    })();
  }, []);

  async function upload(kind: 'photo' | 'video', e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const { data: { user } } = await supabase.auth.getUser();
    const ext  = f.name.split('.').pop() ?? (kind === 'video' ? 'mp4' : 'jpg');
    const path = `${user?.id ?? 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const { error } = await supabase.storage.from('vendor-listings').upload(path, f, { contentType: f.type, upsert: false });
    if (error) { alert(error.message); return; }
    const { data } = supabase.storage.from('vendor-listings').getPublicUrl(path);
    if (kind === 'photo') setPhotos((prev) => [...prev, data.publicUrl]);
    else                  setVideos((prev) => [...prev, data.publicUrl]);
    if (e.target) e.target.value = '';
  }

  async function submit() {
    setMsg(null);
    if (!vendorId)         { setMsg({ ok: false, text: 'No vendor record' }); return; }
    if (!title.trim())     { setMsg({ ok: false, text: 'Title required' }); return; }
    if (Number(quantity) <= 0) { setMsg({ ok: false, text: 'Quantity > 0' }); return; }
    if (Number(price)    <= 0) { setMsg({ ok: false, text: 'Price > 0' }); return; }
    if (photos.length === 0)   { setMsg({ ok: false, text: 'At least one photo required' }); return; }
    if ((vendorType === 'fisherman' || vendorType === 'farmer') && videos.length === 0) {
      setMsg({ ok: false, text: 'A short video is required for fish + produce listings' }); return;
    }

    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = 'Bearer ' + session.access_token;
      const res = await fetch('/api/vendor-listings/create', {
        method:  'POST',
        headers,
        body: JSON.stringify({
          vendor_id:             vendorId,
          title, description,
          product_type:          productType || null,
          quantity_available:    Number(quantity),
          unit,
          price_per_unit:        Number(price),
          harvest_status:        harvestStat,
          harvest_or_catch_time: harvestAt || null,
          dropoff_expected_at:   dropoffAt || null,
          photos, videos,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setMsg({ ok: false, text: j.error || 'Submit failed' }); return; }
      setMsg({ ok: true, text: 'Listing submitted! Dedrick or Jaquel will approve it shortly.' });
      setTimeout(() => { window.location.href = '/vendor/dashboard'; }, 1800);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Submit failed' });
    } finally {
      setBusy(false);
    }
  }

  if (!authChecked) return <div style={pg}>Loading…</div>;

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
          <Field label="Product type"><input value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="e.g. hogfish · grouper · tomato · pepper" style={inp} /></Field>
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

        <Section title="Photos + video">
          <Field label="Photos * (at least 1)">
            <button type="button" onClick={() => photoRef.current?.click()} style={btn}>📸 Add photo</button>
            <input ref={photoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => upload('photo', e)} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, marginTop: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photos.map((u, i) => <img key={i} src={u} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8 }} />)}
            </div>
          </Field>

          <Field label={`Video ${(vendorType === 'fisherman' || vendorType === 'farmer') ? '*' : '(optional)'}`}>
            <button type="button" onClick={() => videoRef.current?.click()} style={btn}>🎥 Add video</button>
            <input ref={videoRef} type="file" accept="video/*" capture="environment" style={{ display: 'none' }} onChange={(e) => upload('video', e)} />
            {videos.length > 0 && <p style={{ fontSize: 11, color: '#067D62', marginTop: 6 }}>✓ {videos.length} video{videos.length === 1 ? '' : 's'} uploaded</p>}
          </Field>
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
const btn: React.CSSProperties = { padding: '10px 16px', borderRadius: 10, background: '#fff', color: '#0F1111', border: '1px solid #d5d9d9', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
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
