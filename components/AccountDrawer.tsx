'use client';

// components/AccountDrawer.tsx
//
// Left slide-in account panel for the marketplace. Opens over /market: the
// marketplace dims behind a backdrop while this panel holds on the left.
// Contents: "Hello {name}", sign in / sign out, orders + history, account
// info + profile, wishlist, and Shop by Department (category links).
//
// Pure presentation + auth/profile read — no order/money logic here.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const DEPARTMENTS = [
  { slug: 'seafood',   label: 'Seafood',   emoji: '🦐' },
  { slug: 'meat',      label: 'Meat',      emoji: '🥩' },
  { slug: 'produce',   label: 'Produce',   emoji: '🥦' },
  { slug: 'beverages', label: 'Beverages', emoji: '🥤' },
  { slug: 'dairy',     label: 'Dairy',     emoji: '🥛' },
  { slug: 'frozen',    label: 'Frozen',    emoji: '🧊' },
  { slug: 'dry-goods', label: 'Dry Goods', emoji: '🌾' },
];

export default function AccountDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState<string | null>(null);

  // Load auth + name whenever the drawer opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { setAuthed(false); setName(''); setEmail(null); return; }
      setAuthed(true);
      setEmail(user.email ?? null);
      setName((user.user_metadata?.full_name as string | undefined) || '');
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      if (!cancelled && prof?.full_name) setName(prof.full_name as string);
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Lock body scroll + close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  async function signOut() {
    await supabase.auth.signOut();
    onClose();
    router.push('/market');
    router.refresh();
  }

  const firstName = name.trim().split(' ')[0] || '';

  return (
    <>
      {/* Backdrop — dims the marketplace behind the panel */}
      <div
        onClick={onClose}
        aria-hidden={!open}
        className={`fixed inset-0 z-[60] bg-black/55 backdrop-blur-[1px] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Left panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Account menu"
        className={`fixed inset-y-0 left-0 z-[61] flex w-[86%] max-w-sm flex-col bg-navy text-white shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Hello {name} */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-navy-700 px-5 py-5">
          <div className="min-w-0">
            <div className="truncate font-display text-xl font-black text-gold">
              {authed && firstName ? `Hello, ${firstName}` : 'Hello 👋'}
            </div>
            <div className="mt-0.5 truncate text-xs text-white/60">
              {authed ? (email || 'Signed in') : 'Sign in for orders & faster checkout'}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="-mr-1 shrink-0 rounded-lg px-2 text-3xl leading-none text-white/70 transition hover:text-white"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {authed === false && (
            <Link
              href="/login"
              onClick={onClose}
              className="mb-4 block rounded-xl bg-gold px-4 py-3 text-center text-sm font-black text-navy transition hover:bg-gold-300"
            >
              Sign in / Register
            </Link>
          )}

          <Section title="Your account">
            <DrawerLink href="/my-orders" onClose={onClose} emoji="📦" label="My Orders" />
            <DrawerLink href="/my-orders" onClose={onClose} emoji="🕘" label="Order History" />
            <DrawerLink href="/account"   onClose={onClose} emoji="👤" label="Account Information" />
            <DrawerLink href="/account"   onClose={onClose} emoji="📍" label="Profile & Addresses" />
            <DrawerLink href="/wishlist"  onClose={onClose} emoji="♡"  label="Wishlist" />
          </Section>

          <Section title="Shop by Department">
            <DrawerLink href="/market" onClose={onClose} emoji="🛒" label="All Products" />
            {DEPARTMENTS.map((d) => (
              <DrawerLink key={d.slug} href={`/category/${d.slug}`} onClose={onClose} emoji={d.emoji} label={d.label} />
            ))}
          </Section>
        </div>

        {/* Footer — sign out */}
        {authed && (
          <div className="border-t border-white/10 px-3 py-3">
            <button
              onClick={signOut}
              className="block w-full rounded-xl border border-white/20 px-4 py-3 text-sm font-bold text-white/85 transition hover:bg-white/5"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function DrawerLink({
  href, label, emoji, onClose,
}: { href: string; label: string; emoji: string; onClose: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-gold"
    >
      <span className="w-5 shrink-0 text-center text-base">{emoji}</span>
      <span>{label}</span>
    </Link>
  );
}
