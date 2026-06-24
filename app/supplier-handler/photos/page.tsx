'use client';

// /supplier-handler/photos — Product Photos workspace.
// Supplier Handler uploads real product photos, crops/resizes them square for
// the marketplace, and matches each to its product (supplier/category/channels
// shown). Missing-photo products surface first. In-browser cropper (no deps);
// the cropped square JPEG is sent to /api/supplier-handler/set-photo.

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const GOLD = '#f5c518';
const INK = '#060d1f';
const CARD = '#0f1a2e';
const BORDER = 'rgba(255,255,255,0.1)';
const V = 300;   // crop viewport (px)
const OUT = 1000; // output square (px)

type Prod = {
  id: string; name: string; sku: string | null; category: string | null; image_url: string | null; has_photo: boolean;
  supplier: string | null; sell_nassau: boolean; sell_andros: boolean; sell_online: boolean; sell_wholesale: boolean;
};

export default function ProductPhotosPage() {
  const router = useRouter();
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const [products, setProducts] = useState<Prod[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'missing' | 'all'>('missing');
  const [q, setQ] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null, [supabase]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const t = await token();
      if (!t) { router.push('/staff-login?next=/supplier-handler/photos'); return; }
      const res = await fetch('/api/supplier-handler/products', { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setProducts(j.products as Prod[]);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [token, router]);
  useEffect(() => { load(); }, [load]);

  // ── Cropper state ──
  const [edit, setEdit] = useState<Prod | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [cover, setCover] = useState(1);
  const [off, setOff] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [busy, setBusy] = useState(false);

  function clamp(x: number, y: number, s: number, w: number, h: number) {
    const iw = w * s, ih = h * s;
    return { x: Math.min(0, Math.max(V - iw, x)), y: Math.min(0, Math.max(V - ih, y)) };
  }

  function openEdit(p: Prod) { setEdit(p); setImgUrl(null); setNat({ w: 0, h: 0 }); }

  function onPick(file: File) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      imgRef.current = im;
      const c = Math.max(V / im.naturalWidth, V / im.naturalHeight);
      setNat({ w: im.naturalWidth, h: im.naturalHeight });
      setCover(c); setScale(c);
      setOff(clamp((V - im.naturalWidth * c) / 2, (V - im.naturalHeight * c) / 2, c, im.naturalWidth, im.naturalHeight));
      setImgUrl(url);
    };
    im.src = url;
  }

  function onZoom(s: number) { setScale(s); setOff(o => clamp(o.x, o.y, s, nat.w, nat.h)); }
  function onDown(e: React.PointerEvent) { drag.current = { sx: e.clientX, sy: e.clientY, ox: off.x, oy: off.y }; (e.target as Element).setPointerCapture(e.pointerId); }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setOff(clamp(drag.current.ox + (e.clientX - drag.current.sx), drag.current.oy + (e.clientY - drag.current.sy), scale, nat.w, nat.h));
  }
  function onUp() { drag.current = null; }

  async function save() {
    if (!edit || !imgRef.current) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUT; canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) { flash('Canvas error'); return; }
      const sx = -off.x / scale, sy = -off.y / scale, sw = V / scale, sh = V / scale;
      ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, OUT, OUT);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const t = await token();
      const res = await fetch('/api/supplier-handler/set-photo', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ product_id: edit.id, image_base64: dataUrl }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { flash(j.error || 'Save failed'); return; }
      setProducts(prev => prev.map(p => p.id === edit.id ? { ...p, image_url: j.image_url, has_photo: true } : p));
      flash(`✓ Photo saved · ${edit.name}`);
      setEdit(null);
    } finally { setBusy(false); }
  }

  const shown = products
    .filter(p => filter === 'all' || !p.has_photo)
    .filter(p => { const s = q.trim().toLowerCase(); return !s || p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s) || (p.supplier ?? '').toLowerCase().includes(s); });
  const missing = products.filter(p => !p.has_photo).length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header style={{ backgroundColor: INK, padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/supplier-handler')} style={{ background: 'transparent', color: GOLD, border: `1px solid rgba(245,197,24,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 18 }}>📷 Product Photos</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{missing} of {products.length} missing a photo</div>
          </div>
          <button onClick={load} disabled={loading} style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{loading ? '…' : '↻'}</button>
        </div>
      </header>

      <main style={{ maxWidth: 980, margin: '0 auto', padding: 20 }}>
        {err && <div style={{ padding: 14, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>⚠️ {err}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {(['missing', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', border: `1px solid ${filter === f ? GOLD : '#e2e8f0'}`, background: filter === f ? GOLD : '#fff', color: filter === f ? INK : '#475569' }}>{f === 'missing' ? `Missing photo (${missing})` : `All (${products.length})`}</button>
          ))}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name / sku / supplier…" style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {shown.map(p => (
            <button key={p.id} onClick={() => openEdit(p)} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 0, overflow: 'hidden', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: '100%', aspectRatio: '1', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ color: '#94a3b8', fontSize: 30 }}>📷</span>}
                {!p.has_photo && <span style={{ position: 'absolute', top: 6, left: 6, background: '#f59e0b', color: '#fff', fontSize: 9, fontWeight: 900, borderRadius: 5, padding: '2px 5px' }}>NO PHOTO</span>}
              </div>
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.supplier ?? '—'}{p.sell_online ? ' · 🌐' : ''}</div>
              </div>
            </button>
          ))}
        </div>
        {!loading && shown.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#64748b', fontSize: 13 }}>{filter === 'missing' ? 'Every product has a photo 🎉' : 'No products match.'}</div>}
      </main>

      {/* Cropper modal */}
      {edit && (
        <div onClick={() => !busy && setEdit(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 360, background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 18 }}>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: 15 }}>📷 {edit.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5, marginBottom: 12 }}>{edit.supplier ?? 'No supplier'} · square crop for the marketplace</div>

            {!imgUrl ? (
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, height: V, border: '2px dashed rgba(255,255,255,0.2)', borderRadius: 12, cursor: 'pointer', color: 'rgba(255,255,255,0.6)' }}>
                <span style={{ fontSize: 30 }}>📤</span><span style={{ fontSize: 13, fontWeight: 700 }}>Choose a photo</span>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); }} />
              </label>
            ) : (
              <>
                <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                  style={{ position: 'relative', width: V, height: V, margin: '0 auto', borderRadius: 12, overflow: 'hidden', background: '#000', touchAction: 'none', cursor: 'grab' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgUrl} alt="" draggable={false} style={{ position: 'absolute', left: off.x, top: off.y, width: nat.w * scale, height: nat.h * scale, maxWidth: 'none', userSelect: 'none' }} />
                  <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Zoom</span>
                  <input type="range" min={cover} max={cover * 4} step={cover / 100} value={scale} onChange={e => onZoom(Number(e.target.value))} style={{ flex: 1 }} />
                </div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10.5, textAlign: 'center', marginBottom: 10 }}>Drag to position · output {OUT}×{OUT}</div>
              </>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEdit(null)} disabled={busy} style={{ flex: 1, background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} disabled={busy || !imgUrl} style={{ flex: 1, background: GOLD, color: INK, border: 'none', borderRadius: 10, padding: '10px', fontWeight: 900, fontSize: 13, cursor: busy ? 'wait' : 'pointer', opacity: !imgUrl ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Save photo'}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#0f1a2e', color: '#fff', borderRadius: 10, padding: '10px 16px', fontSize: 12.5, fontWeight: 700, zIndex: 80, border: `1px solid ${GOLD}` }}>{toast}</div>}
    </div>
  );
}
