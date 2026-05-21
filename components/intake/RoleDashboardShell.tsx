'use client';

// components/intake/RoleDashboardShell.tsx
//
// Minimal authenticated landing page for roles that don't have a
// dedicated dashboard yet. Just an auth gate + hero CTA via
// AddInventoryButton. Per spec: "If a role's dashboard page does not
// yet exist in the codebase, create it as a minimal authenticated page
// that contains only the entry point and the role's name."

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AddInventoryButton from './AddInventoryButton';
import type { KnownRole } from '@/lib/founder-ai/role-tagging';

interface Props {
  role:        KnownRole;
  label:       string;     // "Captain"
  heroTitle:   string;     // "Log Vessel Intake"
  heroSub:     string;     // "Snap a photo of today's offload + GPS captures automatically."
  icon:        string;
  /** Optional set of roles allowed to view this page in addition to the role itself + admins. */
  extraRoles?: string[];
}

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','basic_admin']);

export default function RoleDashboardShell({ role, label, heroTitle, heroSub, icon, extraRoles }: Props) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<{ full_name: string | null; role: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = `/staff-login?next=/${role}`; return; }
      const { data: prof } = await supabase.from('profiles').select('full_name, role').eq('id', session.user.id).maybeSingle();
      const userRole = (prof as { role?: string | null } | null)?.role ?? null;
      const allowed = userRole === role
                   || (userRole !== null && ADMIN_ROLES.has(userRole))
                   || (extraRoles?.includes(userRole ?? '') ?? false);
      if (!allowed) { window.location.href = '/market'; return; }
      setProfile(prof as { full_name: string | null; role: string | null });
      setAuthed(true);
    })();
  }, [role, extraRoles]);

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>{icon} {label}</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, #0f1f3d 0%, #060d1f 100%)', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{icon}</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: '#f5c518', margin: '0 0 6px' }}>{heroTitle}</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: '0 0 18px' }}>
            {heroSub}
          </p>
          <AddInventoryButton role={role} variant="primary" label={heroTitle} icon="📷" />
        </div>

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 18, lineHeight: 1.6 }}>
          Your submission goes to Dedrick&apos;s approval queue at <code style={{ background: '#0b1628', padding: '0 4px', borderRadius: 3 }}>/founder-ai/products/pending</code>. Nothing is live for sale until he approves. GPS + timestamp are captured automatically when you snap a photo.
        </p>
      </main>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
