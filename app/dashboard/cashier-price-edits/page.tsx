'use client';

// /dashboard/cashier-price-edits
//
// Dedrick's 4-5 day review queue for cashier-initiated POS price edits.
// Lists every edit (newest first) with: cashier name, product, old vs
// new POS price, derived cost, channel snapshot, optional reason.
// Inline ✓ Keep / ✏ Mark for revision / ✗ Reject buttons.
//
// Founder + co_founder + control_admin + basic_admin only.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','basic_admin']);

interface EditRow {
  id:                   string;
  product_id:           string;
  product_sku:          string;
  cashier_user_id:      string | null;
  cashier_name:         string | null;
  cashier_role:         string;
  channel_set:          string;
  vat_category:         string;
  old_cost_per_unit:    number | null;
  new_cost_per_unit:    number;
  old_nassau_price:     number | null;
  new_nassau_price:     number;
  channel_prices:       Record<string, number>;
  reason:               string | null;
  edited_at:            string;
  dedrick_reviewed:     boolean;
  dedrick_reviewed_at:  string | null;
  dedrick_notes:        string | null;
  dedrick_decision:     'keep' | 'revise' | 'reject' | null;
}

function dollars(n: number | null | undefined): string {
  if (n == null) return '—';
  return n < 0 ? `−$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}
function dt(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function CashierPriceEditsPage() {
  const [authed,  setAuthed]  = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows,    setRows]    = useState<EditRow[]>([]);
  const [err,     setErr]     = useState<string | null>(null);
  const [filter,  setFilter]  = useState<'all'|'pending'|'reviewed'>('pending');
  const [busy,    setBusy]    = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/cashier-price-edits'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/dashboard'; return; }
      setAuthed(true);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase
      .from('cashier_price_edits')
      .select('*')
      .order('edited_at', { ascending: false })
      .limit(500);
    if (error) { setErr(error.message); setLoading(false); return; }
    const raw = (data ?? []) as EditRow[];

    // Side-fetch cashier names from profiles.
    const userIds = Array.from(new Set(raw.map(r => r.cashier_user_id).filter((x): x is string => !!x)));
    const nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
      for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
        if (p.full_name) nameMap.set(p.id, p.full_name);
      }
    }
    setRows(raw.map(r => ({ ...r, cashier_name: r.cashier_user_id ? nameMap.get(r.cashier_user_id) ?? null : null })));
    setLoading(false);
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'pending') return rows.filter(r => !r.dedrick_reviewed);
    return rows.filter(r => r.dedrick_reviewed);
  }, [rows, filter]);

  const stats = useMemo(() => {
    return {
      total:    rows.length,
      pending:  rows.filter(r => !r.dedrick_reviewed).length,
      reviewed: rows.filter(r => r.dedrick_reviewed).length,
    };
  }, [rows]);

  async function review(id: string, decision: 'keep' | 'revise' | 'reject', notesPrompt?: boolean) {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      let notes: string | null = null;
      if (notesPrompt) {
        notes = prompt(`${decision === 'revise' ? 'What needs revising?' : 'Reason for rejection?'} (optional)`) ?? null;
      }
      const { error } = await supabase
        .from('cashier_price_edits')
        .update({
          dedrick_reviewed:    true,
          dedrick_reviewed_at: new Date().toISOString(),
          dedrick_decision:    decision,
          dedrick_notes:       notes,
        })
        .eq('id', id);
      if (error) { alert('Update failed: ' + error.message); return; }
      await load();
    } finally {
      setBusy(b => ({ ...b, [id]: false }));
    }
  }

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>💸 Cashier price edits — 4-5 day review queue</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Every cashier-set POS price logged here. System back-derives cost from each edit and recomputes all other channels. You ratify or correct.
          </p>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {(['pending','reviewed','all'] as const).map(k => (
              <button key={k} onClick={() => setFilter(k)} style={chip(filter === k)}>
                {k === 'all' ? `All (${stats.total})` : k === 'pending' ? `Pending (${stats.pending})` : `Reviewed (${stats.reviewed})`}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        {err && <div style={errBox}>⚠ {err}</div>}
        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && filtered.length === 0 && (
          <div style={emptyBox}>
            <div style={{ fontSize: 32 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', marginTop: 6 }}>Nothing in the {filter} queue.</div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map(r => {
            const delta = r.old_nassau_price != null ? r.new_nassau_price - r.old_nassau_price : null;
            return (
              <div key={r.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <div>
                    <strong style={{ color: '#fff', fontSize: 14 }}>{r.product_sku}</strong>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginLeft: 8 }}>
                      {r.cashier_name ?? '(unknown)'} · {r.cashier_role} · {dt(r.edited_at)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    {r.dedrick_reviewed ? (
                      <span style={pill(r.dedrick_decision === 'keep' ? '#4ade80' : r.dedrick_decision === 'revise' ? '#fbbf24' : '#f87171')}>
                        ✓ {r.dedrick_decision?.toUpperCase()}
                      </span>
                    ) : (
                      <span style={pill('#fbbf24')}>PENDING</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 10 }}>
                  <Mini label="Old Nassau price" value={dollars(r.old_nassau_price)} />
                  <Mini label="New Nassau price" value={dollars(r.new_nassau_price)} accent="#f5c518" />
                  {delta != null && <Mini label="Δ" value={`${delta >= 0 ? '+' : ''}${dollars(delta)}`} accent={delta >= 0 ? '#4ade80' : '#f87171'} />}
                  <Mini label="Old cost" value={dollars(r.old_cost_per_unit)} />
                  <Mini label="Derived cost" value={dollars(r.new_cost_per_unit)} accent="#fbbf24" />
                  <Mini label="Tax" value={r.vat_category.replace('_', ' ')} />
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>All channels after edit</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Object.entries(r.channel_prices).map(([ch, price]) => (
                      <span key={ch} style={chPill}>{ch.replace(/_/g, ' ')}: <strong style={{ color: '#f5c518', marginLeft: 4 }}>${Number(price).toFixed(2)}</strong></span>
                    ))}
                  </div>
                </div>

                {r.reason && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#cbd5e1' }}>
                    <strong>Reason:</strong> {r.reason}
                  </div>
                )}
                {r.dedrick_notes && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                    <strong>Your notes:</strong> {r.dedrick_notes}
                  </div>
                )}

                {!r.dedrick_reviewed && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button onClick={() => review(r.id, 'reject', true)} disabled={busy[r.id]} style={btnRed(busy[r.id])}>✗ Reject</button>
                    <button onClick={() => review(r.id, 'revise', true)} disabled={busy[r.id]} style={btnAmber(busy[r.id])}>✏ Revise</button>
                    <button onClick={() => review(r.id, 'keep', false)} disabled={busy[r.id]} style={btnGreen(busy[r.id])}>✓ Keep</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 18, lineHeight: 1.6 }}>
          "Keep" simply marks the edit as reviewed — Claff's prices stay live. "Revise" / "Reject" log a note for your records but don't auto-roll-back prices. To actually undo a price, hit /dashboard/pricing-rules or re-edit on the POS.
        </p>
      </main>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: '#060d1f', border: '1px solid rgba(245,197,24,0.1)', borderRadius: 6, padding: '6px 10px' }}>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: accent ?? '#fff' }}>{value}</div>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const card: React.CSSProperties = { background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 10, padding: 14 };
const chPill: React.CSSProperties = { background: '#060d1f', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 12, padding: '2px 10px', fontSize: 11 };
const errBox: React.CSSProperties = { padding: 12, background: 'rgba(248,113,113,0.15)', border: '1px solid #f87171', color: '#f87171', borderRadius: 8, marginBottom: 12 };
const emptyBox: React.CSSProperties = { marginTop: 16, padding: 32, textAlign: 'center', background: 'rgba(74,222,128,0.08)', border: '1px solid #16a34a', borderRadius: 12 };
const chip = (active: boolean): React.CSSProperties => ({
  background: active ? '#f5c518' : 'rgba(245,197,24,0.12)',
  color: active ? '#060d1f' : '#f5c518',
  border: '1px solid #f5c518',
  borderRadius: 16, padding: '4px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
});
const pill = (color: string): React.CSSProperties => ({
  background: `${color}26`, color, border: `1px solid ${color}`,
  borderRadius: 12, padding: '2px 8px', fontSize: 9, fontWeight: 900, letterSpacing: 0.4,
});
const btnGreen = (d: boolean): React.CSSProperties => ({ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: d ? 0.5 : 1 });
const btnAmber = (d: boolean): React.CSSProperties => ({ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid #fbbf24', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: d ? 0.5 : 1 });
const btnRed   = (d: boolean): React.CSSProperties => ({ background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid #f87171', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: d ? 0.5 : 1 });
