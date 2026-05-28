'use client';

// /driver
//
// Mobile-first driver / fulfillment dashboard. Per founder's 8-stage
// online order delivery spec. Staff (founder / co_founder / manager /
// driver) see all active online orders that still need a fulfillment
// action, advance them stage by stage, and capture proof-of-delivery
// (photo required, signature optional) at the final step.
//
// Each order card shows its current stage + only the action buttons
// valid from that stage (driven by lib/order-status availableActions).
// "Delivered" is gated until a PoD photo is attached.

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  availableActions, actionLabel, customerStage,
  type TransitionAction,
} from '@/lib/order-status';

export const dynamic = 'force-dynamic';

interface OrderCard {
  id:                  string;
  fulfillment_status:  string | null;
  customer_name:       string | null;
  customer_phone:      string | null;
  customer_address:    string | null;
  delivery_directions: string | null;
  delivery_lat:        number | null;
  delivery_lng:        number | null;
  total:               number | null;
  created_at:          string;
  wholesale_items:     Array<{ name: string; qty: number; unit?: string }> | null;
  pod_photo_urls:      string[] | null;
}

export default function DriverPage() {
  const [authState, setAuthState] = useState<'checking' | 'no_session' | 'forbidden' | 'ok'>('checking');
  const [orders, setOrders]   = useState<OrderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState<string | null>(null);
  const [toast, setToast]     = useState<{ ok: boolean; msg: string } | null>(null);
  // PoD photo capture
  const [podPhotos, setPodPhotos] = useState<Record<string, string[]>>({});  // orderId → uploaded URLs
  const [pendingPodId, setPendingPodId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  }

  async function loadOrders() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/driver/queue', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      });
      const json = await res.json();
      setOrders(res.ok && json.ok ? (json.orders as OrderCard[]) : []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAuthState('no_session'); return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      const role = (prof as { role?: string | null } | null)?.role ?? null;
      if (!role || !['founder', 'co_founder', 'manager', 'driver'].includes(role)) {
        setAuthState('forbidden'); return;
      }
      setAuthState('ok');
      loadOrders();
    })();
  }, []);

  async function doTransition(order: OrderCard, action: TransitionAction) {
    setBusyId(order.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');
      const body: Record<string, unknown> = { action };
      // Attach PoD photos for delivered
      if (action === 'mark_delivered') {
        const photos = podPhotos[order.id] ?? order.pod_photo_urls ?? [];
        if (photos.length === 0) { showToast(false, 'Take a delivery photo first'); setBusyId(null); return; }
        body.pod_photo_urls = photos;
      }
      const res = await fetch(`/api/orders/${order.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showToast(true, `${order.id.slice(0, 8)} → ${json.customer_label}`);
      // If delivered/cancelled it leaves the active queue → refetch
      await loadOrders();
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function openPodPicker(orderId: string) {
    setPendingPodId(orderId);
    if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click(); }
  }

  async function onPodFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const orderId = pendingPodId;
    setPendingPodId(null);
    if (!file || !orderId) return;
    setBusyId(orderId);
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `proof-of-delivery/${orderId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('site-images')
        .upload(path, file, { upsert: true, contentType: file.type || `image/${ext}` });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('site-images').getPublicUrl(path);
      setPodPhotos((prev) => ({ ...prev, [orderId]: [...(prev[orderId] ?? []), data.publicUrl] }));
      showToast(true, '📸 Delivery photo attached — now tap Delivered');
    } catch (err) {
      showToast(false, `Photo upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyId(null);
    }
  }

  if (authState === 'checking') return <Shell><p className="text-sm text-slate-500">Checking…</p></Shell>;
  if (authState === 'no_session') return (
    <Shell><p className="mb-2 font-bold">Sign in required.</p>
      <Link href="/staff-login?next=/driver" className="text-navy underline">Sign in →</Link></Shell>
  );
  if (authState === 'forbidden') return (
    <Shell><p className="font-bold text-red-700">Driver / manager / founder only.</p></Shell>
  );

  return (
    <Shell>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPodFile} className="hidden" />
      {toast && (
        <div className={`fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-xl border-2 px-4 py-2 text-sm font-bold shadow-xl ${
          toast.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900'
        }`}>{toast.ok ? '✅ ' : '⚠ '}{toast.msg}</div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-extrabold text-navy">🚚 Delivery Queue</h1>
        <button onClick={loadOrders} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600">
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-500">Loading orders…</p>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center">
          <p className="mb-1 text-4xl">🎉</p>
          <p className="font-bold text-slate-700">All caught up</p>
          <p className="text-sm text-slate-500">No orders awaiting fulfillment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const cust = customerStage(o.fulfillment_status);
            const actions = availableActions(o.fulfillment_status);
            const photos = podPhotos[o.id] ?? o.pod_photo_urls ?? [];
            const created = new Date(o.created_at);
            return (
              <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-navy">#{o.id.slice(0, 8)}</span>
                      <StagePill stage={o.fulfillment_status} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ·{' '}
                      {created.toLocaleTimeString('en-US', { timeStyle: 'short' })}
                    </p>
                  </div>
                  <span className="text-sm font-extrabold text-navy">BSD ${(o.total ?? 0).toFixed(2)}</span>
                </div>

                {/* Customer + delivery */}
                <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs">
                  <p className="font-bold text-navy">{o.customer_name ?? '—'}</p>
                  {o.customer_phone && (
                    <a href={`tel:${o.customer_phone}`} className="text-navy underline">{o.customer_phone}</a>
                  )}
                  {o.customer_address && <p className="mt-0.5 text-slate-600">{o.customer_address}</p>}
                  {o.delivery_directions && <p className="mt-0.5 italic text-slate-500">“{o.delivery_directions}”</p>}
                  {o.delivery_lat != null && o.delivery_lng != null && (
                    <a
                      href={`https://maps.google.com/?q=${o.delivery_lat},${o.delivery_lng}`}
                      target="_blank" rel="noopener noreferrer"
                      className="mt-1 inline-block rounded bg-navy px-2 py-1 text-[11px] font-bold text-white"
                    >📍 Open in Maps</a>
                  )}
                </div>

                {/* Items */}
                {o.wholesale_items && o.wholesale_items.length > 0 && (
                  <ul className="mt-2 text-xs text-slate-600">
                    {o.wholesale_items.slice(0, 6).map((it, i) => (
                      <li key={i}>• {it.qty}× {it.name}</li>
                    ))}
                    {o.wholesale_items.length > 6 && <li className="text-slate-400">+ {o.wholesale_items.length - 6} more</li>}
                  </ul>
                )}

                {/* PoD photos preview (when in delivery range) */}
                {(o.fulfillment_status === 'out_for_delivery' || o.fulfillment_status === 'in_transit') && (
                  <div className="mt-2 flex items-center gap-2">
                    {photos.map((url, i) => (
                      <img key={i} src={url} alt="" className="h-12 w-12 rounded object-cover ring-1 ring-slate-200" />
                    ))}
                    <button
                      onClick={() => openPodPicker(o.id)}
                      disabled={busyId === o.id}
                      className="rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50"
                    >📷 Delivery photo</button>
                  </div>
                )}

                {/* Action buttons */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {actions.map((a) => {
                    const isDeliver = a === 'mark_delivered';
                    const isCancel  = a === 'cancel';
                    const blocked = isDeliver && photos.length === 0;
                    return (
                      <button
                        key={a}
                        onClick={() => doTransition(o, a)}
                        disabled={busyId === o.id || blocked}
                        title={blocked ? 'Take a delivery photo first' : ''}
                        className={`rounded-lg px-3 py-2 text-xs font-extrabold transition disabled:opacity-50 ${
                          isCancel  ? 'border border-red-300 bg-white text-red-600 hover:bg-red-50' :
                          isDeliver ? 'bg-emerald-600 text-white hover:bg-emerald-700' :
                                      'bg-navy text-gold hover:opacity-90'
                        }`}
                      >
                        {actionLabel(a)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-md items-center justify-between px-4">
          <Link href="/dashboard" className="text-sm font-extrabold text-gold">← BSC Control</Link>
          <span className="text-xs font-semibold text-white/70">Driver</span>
        </div>
      </header>
      <main className="mx-auto max-w-screen-md px-3 py-4">{children}</main>
    </div>
  );
}

function StagePill({ stage }: { stage: string | null }) {
  const cust = customerStage(stage);
  const palette: Record<string, string> = {
    order_placed:      'bg-blue-100 text-blue-700',
    preparing_to_ship: 'bg-amber-100 text-amber-700',
    in_transit:        'bg-purple-100 text-purple-700',
    out_for_delivery:  'bg-orange-100 text-orange-700',
    delivered:         'bg-emerald-100 text-emerald-700',
    cancelled:         'bg-slate-200 text-slate-600',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${palette[cust.stage] ?? 'bg-slate-100 text-slate-600'}`}>
      {cust.label}
    </span>
  );
}
