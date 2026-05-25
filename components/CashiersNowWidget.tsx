'use client';

// components/CashiersNowWidget.tsx
//
// Phase 2b: live "Cashiers Right Now" card for the founder dashboard.
// Reads cash_drawer_session_totals (security_invoker=true since D-security)
// for status='open' rows, joins profiles for the cashier name, and
// renders one row per active cashier with their running sales total +
// 10h countdown badge (same color logic as the POS shift chip from
// Phase 2a so founder + cashier see consistent visual language).
//
// Auto-refresh: 30s for data, 60s for the countdown tick.
// Each row click-throughs to /dashboard/cashiers for the full view.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const SHIFT_MAX_MS = 10 * 60 * 60 * 1000;

interface OpenShift {
  session_id:          string;
  cashier_user_id:     string;
  location:            string;
  opened_at:           string;
  opening_float_cents: number;
  total_sales_cents:   number;
  order_count:         number;
}

interface CashierProfile { id: string; full_name: string | null; }

function formatRemaining(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatOpenedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Color logic matches the POS Phase 2a shift chip so cashier + founder
// see the same visual cue for shift health.
function shiftColors(msLeft: number, expired: boolean): { dot: string; text: string; bg: string; border: string } {
  if (expired) return { dot: '#ef4444', text: '#fca5a5', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.40)' };
  if (msLeft <= 30 * 60 * 1000) return { dot: '#ef4444', text: '#fca5a5', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.35)' };
  if (msLeft <= 60 * 60 * 1000) return { dot: '#eab308', text: '#fde68a', bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.35)' };
  return { dot: '#22c55e', text: '#bbf7d0', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.30)' };
}

export default function CashiersNowWidget() {
  const [shifts,   setShifts]   = useState<OpenShift[]>([]);
  const [profiles, setProfiles] = useState<Record<string, CashierProfile>>({});
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [nowTick,  setNowTick]  = useState(() => Date.now());

  async function load() {
    try {
      const { data: openRows, error: sErr } = await supabase
        .from('cash_drawer_session_totals')
        .select('session_id, cashier_user_id, location, opened_at, opening_float_cents, total_sales_cents, order_count')
        .eq('status', 'open');
      if (sErr) throw sErr;
      const open = (openRows ?? []) as OpenShift[];
      setShifts(open);

      const ids = Array.from(new Set(open.map(o => o.cashier_user_id)));
      if (ids.length > 0) {
        const { data: profRows } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids);
        const map: Record<string, CashierProfile> = {};
        for (const p of (profRows ?? []) as CashierProfile[]) map[p.id] = p;
        setProfiles(map);
      } else {
        setProfiles({});
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cashier shifts');
    } finally {
      setLoading(false);
    }
  }

  // 30s data refresh.
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  // 60s countdown tick — re-renders the badge time-remaining without
  // re-fetching data.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const sortedShifts = useMemo(() => {
    // Sort by remaining time ascending so the most-urgent (least-time-left
    // or expired) shifts appear first.
    return [...shifts].sort((a, b) => {
      const ageA = nowTick - new Date(a.opened_at).getTime();
      const ageB = nowTick - new Date(b.opened_at).getTime();
      return ageB - ageA;  // oldest shift first → least time left first
    });
  }, [shifts, nowTick]);

  return (
    <div style={{
      backgroundColor: '#0a1325',
      border: '1px solid rgba(245,197,24,0.20)',
      borderRadius: 14,
      padding: '14px 16px',
      marginBottom: 14,
      boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div style={{ color: '#f5c518', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: 2 }}>
          🟢 Cashiers Right Now
        </div>
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 600 }}>
          {loading ? 'Refreshing…' : `${shifts.length} active`}
        </div>
      </div>

      {loading && shifts.length === 0 && (
        <div style={{ padding: '14px 0', color: 'rgba(255,255,255,0.40)', fontSize: 12, textAlign: 'center' }}>
          Loading shifts…
        </div>
      )}

      {!loading && error && (
        <div style={{
          padding: '10px 12px',
          color: '#fca5a5',
          fontSize: 12,
          fontWeight: 600,
          background: 'rgba(239,68,68,0.10)',
          border: '1px solid rgba(239,68,68,0.30)',
          borderRadius: 8,
        }}>
          ⚠ Couldn&rsquo;t load: {error}
        </div>
      )}

      {!loading && !error && shifts.length === 0 && (
        <div style={{
          padding: '14px 12px',
          color: 'rgba(255,255,255,0.55)',
          fontSize: 12,
          textAlign: 'center',
          fontStyle: 'italic',
        }}>
          No cashier shifts open right now.
        </div>
      )}

      {!loading && !error && shifts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sortedShifts.map((s) => {
            const profile = profiles[s.cashier_user_id];
            const name = profile?.full_name ?? `User ${s.cashier_user_id.slice(0, 8)}`;
            const openedMs = new Date(s.opened_at).getTime();
            const ageMs = nowTick - openedMs;
            const msLeft = Math.max(0, SHIFT_MAX_MS - ageMs);
            const expired = ageMs > SHIFT_MAX_MS;
            const colors = shiftColors(msLeft, expired);

            return (
              <Link
                key={s.session_id}
                href="/dashboard/cashiers"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  textDecoration: 'none',
                  transition: 'transform 120ms ease, background 120ms ease',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)'; }}
              >
                {/* Color dot — green/yellow/red per shift remaining */}
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: colors.dot,
                    flexShrink: 0,
                    animation: expired ? 'bsc-pulse 1.4s ease-in-out infinite' : undefined,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>
                    {name}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 }}>
                    {s.location} · since {formatOpenedAt(s.opened_at)}
                    {' · '}
                    {expired
                      ? <span style={{ color: colors.text, fontWeight: 800 }}>SHIFT EXPIRED — close now</span>
                      : <span style={{ color: colors.text, fontWeight: 700 }}>{formatRemaining(msLeft)} left</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: '#f4c842', fontWeight: 900, fontSize: 14 }}>
                    ${(s.total_sales_cents / 100).toFixed(2)}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 2 }}>
                    {s.order_count} sale{s.order_count === 1 ? '' : 's'}
                  </div>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.30)', fontSize: 18, marginLeft: 4, flexShrink: 0 }}>→</span>
              </Link>
            );
          })}
        </div>
      )}

      <Link
        href="/dashboard/cashiers"
        style={{
          display: 'block',
          marginTop: shifts.length > 0 ? 10 : 8,
          color: '#f4c842',
          fontSize: 11,
          fontWeight: 700,
          textDecoration: 'none',
          textAlign: 'right',
          letterSpacing: 0.5,
        }}
      >
        Full cashier dashboard →
      </Link>
    </div>
  );
}
