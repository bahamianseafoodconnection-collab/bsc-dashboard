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
import { DEPARTMENTS } from '@/lib/departments';

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
            <DrawerLink href="/my-orders" onClose={onClose} label="My Orders" />
            <DrawerLink href="/my-orders" onClose={onClose} label="Order History" />
            <DrawerLink href="/account"   onClose={onClose} label="Account Information" />
            <DrawerLink href="/account"   onClose={onClose} label="Profile & Addresses" />
            <DrawerLink href="/wishlist"  onClose={onClose} label="Wishlist" />
          </Section>

          <Section title="Shop by Department">
            <DrawerLink href="/market" onClose={onClose} label="All Products" />
            {DEPARTMENTS.map((d) => (
              <DrawerLink key={d.slug} href={`/category/${d.slug}`} onClose={onClose} label={d.label} />
            ))}
          </Section>
        </div>

        {/* Footer — sign out (gold for visibility against navy) */}
        {authed && (
          <div className="border-t border-white/10 bg-navy-700 px-4 py-4">
            <button
              onClick={signOut}
              className="block w-full rounded-xl bg-gold px-4 py-4 text-base font-black uppercase tracking-wider text-navy shadow-lg ring-1 ring-gold/60 transition hover:bg-gold-300 active:translate-y-px"
            >
              Sign Out
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="px-4 pb-2 text-[11px] font-black uppercase tracking-[0.22em] text-gold/80">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function DrawerLink({
  href, label, onClose,
}: { href: string; label: string; onClose: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="group relative block rounded-lg px-4 py-3 text-[15px] font-extrabold text-white no-underline transition hover:bg-white/10 hover:text-gold [text-decoration:none]"
    >
      <span className="absolute inset-y-2 left-1 w-1 rounded-full bg-gold opacity-0 transition group-hover:opacity-100" />
      {label}
    </Link>
  );
}
