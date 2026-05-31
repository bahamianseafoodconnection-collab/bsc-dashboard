'use client';

// /account — customer hub. Profile, saved addresses, quick links.
// Tailwind, brand tokens, mobile-first.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LANGUAGES, type Lang } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

const ISLANDS = ['Nassau', 'Andros', 'Exuma', 'Grand Bahama', 'Abaco', 'Eleuthera', 'Other'];

type Address = {
  id: string;
  label: string | null;
  recipient_name: string | null;
  phone: string | null;
  street: string;
  island: string;
  notes: string | null;
  is_default: boolean;
};

export default function AccountPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);

  // Profile
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileLang, setProfileLang] = useState<Lang>('en');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Order count for quick stats
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [wishlistCount, setWishlistCount] = useState<number | null>(null);
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);

  // Addresses
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aLabel, setALabel] = useState('');
  const [aRecipient, setARecipient] = useState('');
  const [aPhone, setAPhone] = useState('');
  const [aStreet, setAStreet] = useState('');
  const [aIsland, setAIsland] = useState('Nassau');
  const [aNotes, setANotes] = useState('');
  const [aIsDefault, setAIsDefault] = useState(false);
  const [aSaving, setASaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user ?? null;
      if (cancelled) return;
      setAuthChecked(true);
      if (!u) {
        setUser(null);
        return;
      }
      setUser({ id: u.id, email: u.email ?? null });

      const [{ data: prof }, { count: wCount }, addrLoad] = await Promise.all([
        supabase.from('profiles').select('full_name, phone, language').eq('id', u.id).maybeSingle(),
        supabase.from('wishlists').select('id', { count: 'exact', head: true }).eq('auth_user_id', u.id),
        supabase
          .from('customer_addresses')
          .select('id, label, recipient_name, phone, street, island, notes, is_default')
          .eq('auth_user_id', u.id)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      setProfileName((prof?.full_name as string) || '');
      setProfilePhone((prof?.phone as string) || '');
      setProfileLang(((prof?.language as Lang | undefined) ?? 'en'));
      setWishlistCount(wCount ?? 0);
      if (addrLoad.error) setAddressError(addrLoad.error.message);
      setAddresses((addrLoad.data || []) as Address[]);
      setAddressesLoaded(true);

      // Order count via the service-role endpoint — orders has no user_id and
      // customer_id is split (auth uid vs customers-record id), so the server
      // resolves both. A direct client count would always read 0.
      try {
        const res = await fetch('/api/orders/mine', {
          headers: { Authorization: `Bearer ${session!.access_token}` },
        });
        const json = await res.json();
        if (!cancelled && res.ok && json?.ok) setOrderCount((json.orders ?? []).length);
        else if (!cancelled) setOrderCount(0);
      } catch { if (!cancelled) setOrderCount(0); }

      // Loyalty points — read from the customer record linked to this auth user.
      const { data: pts } = await supabase
        .from('customers')
        .select('points_balance')
        .eq('auth_user_id', u.id)
        .maybeSingle();
      if (!cancelled) setPointsBalance((pts as { points_balance?: number } | null)?.points_balance ?? 0);
    })();
    return () => { cancelled = true; };
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    setProfileSaved(false);
    // CRITICAL: never overwrite role here. If a staff member opens
    // their own /account page, upserting role='customer' would
    // silently demote them out of dashboard access.
    // → Check first; only set role when creating a brand-new profile.
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (existing) {
      await supabase.from('profiles')
        .update({ full_name: profileName.trim(), phone: profilePhone.trim() || null, language: profileLang })
        .eq('id', user.id);
    } else {
      await supabase.from('profiles').insert({
        id: user.id,
        full_name: profileName.trim(),
        phone: profilePhone.trim() || null,
        language: profileLang,
        role: 'customer',
      });
    }
    setSavingProfile(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2400);
  }

  function resetAddrForm() {
    setEditingId(null);
    setALabel(''); setARecipient(''); setAPhone('');
    setAStreet(''); setAIsland('Nassau'); setANotes('');
    setAIsDefault(addresses.length === 0);
  }

  function startEdit(a: Address) {
    setEditingId(a.id);
    setALabel(a.label || '');
    setARecipient(a.recipient_name || '');
    setAPhone(a.phone || '');
    setAStreet(a.street);
    setAIsland(a.island);
    setANotes(a.notes || '');
    setAIsDefault(a.is_default);
    setShowAddrForm(true);
  }

  async function saveAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !aStreet.trim()) return;
    setASaving(true);
    setAddressError(null);

    // If marking this as default, clear the previous default first.
    if (aIsDefault) {
      await supabase
        .from('customer_addresses')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('auth_user_id', user.id)
        .eq('is_default', true)
        .neq('id', editingId || '00000000-0000-0000-0000-000000000000');
    }

    const row = {
      auth_user_id: user.id,
      label: aLabel.trim() || null,
      recipient_name: aRecipient.trim() || profileName.trim() || null,
      phone: aPhone.trim() || profilePhone.trim() || null,
      street: aStreet.trim(),
      island: aIsland,
      notes: aNotes.trim() || null,
      is_default: aIsDefault,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      const { error } = await supabase.from('customer_addresses').update(row).eq('id', editingId);
      if (error) { setAddressError(error.message); setASaving(false); return; }
    } else {
      const { error } = await supabase.from('customer_addresses').insert(row);
      if (error) { setAddressError(error.message); setASaving(false); return; }
    }

    const { data } = await supabase
      .from('customer_addresses')
      .select('id, label, recipient_name, phone, street, island, notes, is_default')
      .eq('auth_user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    setAddresses((data || []) as Address[]);

    setASaving(false);
    setShowAddrForm(false);
    resetAddrForm();
  }

  async function deleteAddress(id: string) {
    if (!confirm('Delete this address?')) return;
    await supabase.from('customer_addresses').delete().eq('id', id);
    setAddresses((rs) => rs.filter((a) => a.id !== id));
  }

  async function makeDefault(a: Address) {
    if (!user || a.is_default) return;
    await supabase
      .from('customer_addresses')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('auth_user_id', user.id)
      .eq('is_default', true);
    await supabase
      .from('customer_addresses')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', a.id);
    setAddresses((rs) => rs.map((x) => ({ ...x, is_default: x.id === a.id })));
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (!authChecked) {
    return (
      <Shell>
        <div className="py-20 text-center text-slate-500">Loading…</div>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-20 text-center">
          <div className="mb-3 text-5xl">👤</div>
          <h1 className="font-display text-2xl font-black text-navy">Sign in to your account</h1>
          <p className="mt-2 text-sm text-slate-500">
            Track orders, manage saved addresses, and keep your wishlist across devices.
          </p>
          <Link
            href="/login?next=/account"
            className="mt-6 inline-block rounded-xl bg-navy px-6 py-3 text-sm font-black text-gold transition hover:bg-navy-700"
          >
            Sign in
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">
            Hi, {profileName.split(' ')[0] || 'there'}
          </h1>
          <div className="mt-1 text-sm text-slate-500">
            {user.email || 'Signed in'}
          </div>
        </div>
        <button
          onClick={signOut}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
        >
          Sign out
        </button>
      </div>

      {/* Quick stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <QuickLink href="/my-orders" label="Orders" value={orderCount ?? 0} icon="📦" />
        <QuickLink href="/wishlist" label="Wishlist" value={wishlistCount ?? 0} icon="♡" />
        <QuickLink href="/market" label="Browse market" value="→" icon="🛒" />
      </div>

      {/* Rewards — 4 points per $1 of BSC profit on every delivered order */}
      <section className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white shadow-card sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-emerald-100">BSC Rewards</div>
            <div className="mt-1 font-display text-3xl font-black">
              {(pointsBalance ?? 0).toLocaleString()} <span className="text-base font-semibold text-emerald-100">points</span>
            </div>
            <div className="mt-1 text-sm text-emerald-50">
              Worth ${((pointsBalance ?? 0) / 4).toFixed(2)} off a future order
            </div>
          </div>
          <div className="text-4xl">★</div>
        </div>
        <div className="mt-3 text-[11px] text-emerald-100/90">
          Earn 4 points for every $1 of BSC profit on delivered orders.
        </div>
      </section>

      {/* Profile */}
      <section className="mb-6 rounded-2xl bg-white p-5 shadow-card sm:p-6">
        <h2 className="mb-4 font-display text-lg font-black text-navy">Profile</h2>
        <form onSubmit={saveProfile} className="space-y-3">
          <Field label="Name">
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className={INPUT}
              placeholder="Your name"
            />
          </Field>
          <Field label="Phone">
            <input
              value={profilePhone}
              onChange={(e) => setProfilePhone(e.target.value)}
              className={INPUT}
              placeholder="+1 (242) 000-0000"
              inputMode="tel"
            />
          </Field>
          <Field label="Language · Lang · Idioma">
            <div className="grid grid-cols-3 gap-2">
              {LANGUAGES.map((L) => {
                const sel = profileLang === L.code;
                return (
                  <button key={L.code} type="button" onClick={() => setProfileLang(L.code)}
                    className="rounded-lg px-3 py-2 text-center text-xs font-bold"
                    style={{
                      backgroundColor: sel ? '#1a2e5a' : '#f1f5f9',
                      color: sel ? '#f5c518' : '#475569',
                      border: sel ? '2px solid #f5c518' : '2px solid #e2e8f0',
                    }}>
                    <div style={{ fontSize: 18, lineHeight: 1 }}>{L.flag}</div>
                    <div style={{ marginTop: 4 }}>{L.native}</div>
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-xl bg-navy px-5 py-2.5 text-sm font-black text-gold hover:bg-navy-700 disabled:opacity-60"
            >
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
            {profileSaved && <span className="text-xs font-bold text-emerald-600">✓ Saved</span>}
          </div>
        </form>
      </section>

      {/* Addresses */}
      <section className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
        <div className="mb-4 flex items-end justify-between gap-2">
          <h2 className="font-display text-lg font-black text-navy">Saved addresses</h2>
          {!showAddrForm && (
            <button
              onClick={() => { resetAddrForm(); setShowAddrForm(true); }}
              className="rounded-xl bg-navy px-4 py-2 text-xs font-black text-gold hover:bg-navy-700"
            >
              + Add address
            </button>
          )}
        </div>

        {addressError && (
          <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            {addressError}
            {(addressError.toLowerCase().includes('relation') ||
              addressError.toLowerCase().includes('does not exist')) && (
              <div className="mt-1">
                Run sql/2026-05-09-customer-addresses.sql in the Supabase SQL editor.
              </div>
            )}
          </div>
        )}

        {showAddrForm && (
          <form onSubmit={saveAddress} className="mb-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="mb-3 grid grid-cols-2 gap-3">
              <Field label="Label">
                <input
                  value={aLabel}
                  onChange={(e) => setALabel(e.target.value)}
                  placeholder="Home, Office…"
                  className={INPUT}
                />
              </Field>
              <Field label="Island">
                <select
                  value={aIsland}
                  onChange={(e) => setAIsland(e.target.value)}
                  className={INPUT}
                >
                  {ISLANDS.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Street / location">
              <input
                value={aStreet}
                onChange={(e) => setAStreet(e.target.value)}
                placeholder="Street, area, landmark"
                className={INPUT}
                required
              />
            </Field>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Recipient name">
                <input
                  value={aRecipient}
                  onChange={(e) => setARecipient(e.target.value)}
                  placeholder={profileName || 'Who receives'}
                  className={INPUT}
                />
              </Field>
              <Field label="Phone">
                <input
                  value={aPhone}
                  onChange={(e) => setAPhone(e.target.value)}
                  placeholder={profilePhone || '+1 (242)…'}
                  className={INPUT}
                  inputMode="tel"
                />
              </Field>
            </div>
            <Field label="Notes for the driver">
              <input
                value={aNotes}
                onChange={(e) => setANotes(e.target.value)}
                placeholder="Gate code, building, etc."
                className={INPUT}
              />
            </Field>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={aIsDefault}
                onChange={(e) => setAIsDefault(e.target.checked)}
              />
              Use as my default delivery address
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={aSaving || !aStreet.trim()}
                className="rounded-xl bg-navy px-5 py-2.5 text-sm font-black text-gold hover:bg-navy-700 disabled:opacity-60"
              >
                {aSaving ? 'Saving…' : editingId ? 'Save changes' : 'Save address'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddrForm(false); resetAddrForm(); }}
                className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {addressesLoaded && addresses.length === 0 && !showAddrForm && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No saved addresses yet. Add one to speed up checkout.
          </div>
        )}

        <div className="space-y-3">
          {addresses.map((a) => (
            <div
              key={a.id}
              className={`rounded-xl border p-4 ${
                a.is_default ? 'border-navy bg-navy/5' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-extrabold text-navy">
                  {a.label || a.island}
                </span>
                {a.is_default && (
                  <span className="rounded-md bg-gold px-2 py-0.5 text-[10px] font-extrabold text-navy">
                    Default
                  </span>
                )}
              </div>
              <div className="text-sm text-slate-700">{a.street}</div>
              <div className="text-xs text-slate-500">{a.island}</div>
              {(a.recipient_name || a.phone) && (
                <div className="mt-1 text-xs text-slate-500">
                  {a.recipient_name}{a.recipient_name && a.phone && ' · '}{a.phone}
                </div>
              )}
              {a.notes && (
                <div className="mt-1 text-xs italic text-slate-500">{a.notes}</div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {!a.is_default && (
                  <button
                    onClick={() => makeDefault(a)}
                    className="rounded-md bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                  >
                    Make default
                  </button>
                )}
                <button
                  onClick={() => startEdit(a)}
                  className="rounded-md bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteAddress(a.id)}
                  className="rounded-md bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-100"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}

const INPUT =
  'w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-navy outline-none transition focus:border-navy focus:shadow-[0_0_0_3px_rgba(26,46,90,0.1)] placeholder:text-slate-300';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function QuickLink({
  href,
  label,
  value,
  icon,
}: {
  href: string;
  label: string;
  value: number | string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-card ring-1 ring-slate-100 transition hover:shadow-card-hover"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy/5 text-xl">
        {icon}
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {label}
        </div>
        <div className="text-lg font-extrabold text-navy">{value}</div>
      </div>
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-md items-center gap-3 px-4 sm:h-16 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <img
              src={`${STORAGE_BASE}/logo.jpg`}
              alt="BSC"
              className="h-9 w-9 rounded-full border-2 border-gold object-cover"
            />
            <div className="hidden text-white sm:block">
              <div className="text-sm font-extrabold tracking-wide text-gold">
                BSC Marketplace
              </div>
              <div className="text-[10px] text-slate-300">Your account</div>
            </div>
          </Link>
          <Link
            href="/market"
            className="ml-auto rounded-lg bg-gold px-3 py-2 text-xs font-bold text-navy hover:bg-gold-300"
          >
            Shop
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-screen-md px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
