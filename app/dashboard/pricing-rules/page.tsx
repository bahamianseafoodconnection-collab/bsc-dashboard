'use client';

// /dashboard/pricing-rules — admin console for the 5-channel pricing math.
//
// Shows the live pricing_rules table (5 channels: wholesale_in_store /
// wholesale_online / online_retail / nassau_pos / andros_pos) + the
// pricing_config knobs (wholesale_min_lbs, wholesale_case_flag) + the
// pricing_rules_audit log (who changed what, when).
//
// Live preview at the bottom: type a cost and see what each channel
// would charge — including the wholesale auto-upgrade behavior at
// 10+ lbs / case.
//
// RLS gives anyone authenticated read on pricing_rules + pricing_config
// (so the preview math matches the DB), but only is_bsc_admin can
// write. We gate the page itself to admin roles to match.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { calculatePrice, type PricingChannel, type SaleUnit } from '@/lib/pricing';

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);

interface PricingRule {
  channel:       PricingChannel;
  markup_pct:    number;
  vat_pct:       number;
  description:   string;
  effective_from: string;
  updated_at:    string;
  updated_by:    string | null;
}

interface PricingConfigRow { key: string; value: string; notes: string | null; }

interface AuditRow {
  id:             number;
  channel:        string;
  old_markup_pct: number | null;
  new_markup_pct: number | null;
  old_vat_pct:    number | null;
  new_vat_pct:    number | null;
  changed_by:     string | null;
  changed_at:     string;
  operation:      string;
}

interface ProfileMini { id: string; full_name: string | null; }

const CHANNEL_META: Record<PricingChannel, { label: string; emoji: string; color: string }> = {
  wholesale_in_store: { label: 'In-store Wholesale', emoji: '📦', color: '#a78bfa' },
  wholesale_online:   { label: 'Online Wholesale',   emoji: '🌐', color: '#22d3ee' },
  online_retail:      { label: 'Online Retail',      emoji: '🛒', color: '#60a5fa' },
  nassau_pos:         { label: 'Nassau POS',         emoji: '🟡', color: '#f5c518' },
  andros_pos:         { label: 'Andros POS',         emoji: '🟣', color: '#c084fc' },
};

export default function PricingRulesPage() {
  const [authed, setAuthed]   = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rules, setRules]     = useState<PricingRule[]>([]);
  const [config, setConfig]   = useState<PricingConfigRow[]>([]);
  const [audit, setAudit]     = useState<AuditRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMini>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PricingRule | null>(null);
  const [editConfig, setEditConfig] = useState<PricingConfigRow | null>(null);
  const [previewCost, setPreviewCost] = useState('10.00');
  const [previewUnit, setPreviewUnit] = useState<SaleUnit>('lb');
  const [previewQty,  setPreviewQty]  = useState(1);
  const [toast,       setToast]       = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/pricing-rules'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      const role = (prof?.role as string) ?? '';
      setIsAdmin(ADMIN_ROLES.has(role));
      setAuthed(true);
      await load();
    })();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: r }, { data: c }, { data: a }] = await Promise.all([
      supabase.from('pricing_rules').select('*').order('markup_pct', { ascending: true }),
      supabase.from('pricing_config').select('*').order('key'),
      supabase.from('pricing_rules_audit').select('*').order('changed_at', { ascending: false }).limit(50),
    ]);
    setRules((r ?? []) as PricingRule[]);
    setConfig((c ?? []) as PricingConfigRow[]);
    setAudit((a ?? []) as AuditRow[]);

    // Fetch profile names for audit + rule actors
    const ids = Array.from(new Set([
      ...((r ?? []) as PricingRule[]).map(x => x.updated_by).filter((x): x is string => !!x),
      ...((a ?? []) as AuditRow[]).map(x => x.changed_by).filter((x): x is string => !!x),
    ]));
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const m: Record<string, ProfileMini> = {};
      for (const p of (profs ?? []) as ProfileMini[]) m[p.id] = p;
      setProfiles(m);
    }
    setLoading(false);
  }

  function nameFor(id: string | null): string {
    if (!id) return 'system';
    return profiles[id]?.full_name ?? id.slice(0, 8);
  }

  const wholesaleMinLbs = useMemo(() => {
    const c = config.find(x => x.key === 'wholesale_min_lbs');
    return c ? Number(c.value) : 10;
  }, [config]);

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← BSC Control</Link>
          <h1 style={h1}>🧮 Pricing rules</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            5 channels · {wholesaleMinLbs}+ lbs of one product auto-upgrades retail → wholesale ·
            {isAdmin ? ' admin · changes audited' : ' read-only (admin only edits)'}
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        {toast && (
          <div style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid #16a34a', color: '#4ade80', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
            {toast}
          </div>
        )}

        {/* 5-channel grid */}
        <section style={{ marginBottom: 22 }}>
          <h2 style={h2}>Active rules</h2>
          {loading && <p style={{ color: 'rgba(255,255,255,0.55)' }}>Loading…</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {rules.map(r => {
              const m = CHANNEL_META[r.channel];
              return (
                <div key={r.channel} style={{ ...card, borderTop: `3px solid ${m.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 800, color: m.color, textTransform: 'uppercase', letterSpacing: 1 }}>{m.emoji} {r.channel.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginTop: 2 }}>{m.label}</div>
                    </div>
                    {isAdmin && (
                      <button onClick={() => setEditing(r)} style={editBtn}>Edit</button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'baseline' }}>
                    <div>
                      <div style={lab}>Markup</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: m.color }}>{Number(r.markup_pct).toFixed(2)}%</div>
                    </div>
                    <div>
                      <div style={lab}>VAT</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#cbd5e1' }}>{Number(r.vat_pct).toFixed(2)}%</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', margin: '8px 0 0', lineHeight: 1.4 }}>{r.description}</p>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
                    Updated {new Date(r.updated_at).toLocaleString()} by {nameFor(r.updated_by)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Config */}
        <section style={{ marginBottom: 22 }}>
          <h2 style={h2}>Configuration</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {config.map(c => (
              <div key={c.key} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div>
                    <div style={lab}>{c.key.replace(/_/g, ' ')}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color: '#f5c518', marginTop: 2 }}>{c.value}</div>
                  </div>
                  {isAdmin && <button onClick={() => setEditConfig(c)} style={editBtn}>Edit</button>}
                </div>
                {c.notes && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', margin: '6px 0 0', lineHeight: 1.4 }}>{c.notes}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* Live preview */}
        <section style={{ marginBottom: 22 }}>
          <h2 style={h2}>💡 Live preview — cost → price across all 5 channels</h2>
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
              <Field label="Cost basis (BSD)">
                <input type="number" inputMode="decimal" step="0.01" min="0" value={previewCost}
                  onChange={e => setPreviewCost(e.target.value)} style={inp} />
              </Field>
              <Field label="Quantity">
                <input type="number" inputMode="decimal" step="0.01" min="0.01" value={previewQty}
                  onChange={e => setPreviewQty(Math.max(0.01, Number(e.target.value) || 0))} style={inp} />
              </Field>
              <Field label="Unit">
                <select value={previewUnit} onChange={e => setPreviewUnit(e.target.value as SaleUnit)} style={inp}>
                  <option value="lb">lb</option>
                  <option value="each">each</option>
                  <option value="case">case</option>
                  <option value="bag">bag</option>
                  <option value="portion">portion</option>
                </select>
              </Field>
            </div>
            {Number(previewCost) > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                {rules.map(r => {
                  const meta = CHANNEL_META[r.channel];
                  try {
                    const result = calculatePrice({
                      cost: Number(previewCost),
                      channel: r.channel,
                      quantity: previewQty,
                      unit: previewUnit,
                    });
                    return (
                      <div key={r.channel} style={{ background: '#060d1f', borderRadius: 8, padding: 10, border: `1px solid ${meta.color}33` }}>
                        <div style={{ fontSize: 9, fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{meta.emoji} {r.channel.replace(/_/g, ' ')}</div>
                        {result.upgradedToWholesale && (
                          <div style={{ fontSize: 8, fontWeight: 800, color: '#16a34a', marginTop: 2, textTransform: 'uppercase' }}>↗ Upgraded to {result.effectiveChannel.replace(/_/g, ' ')}</div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#cbd5e1' }}>
                          <span>Subtotal</span><span style={{ color: '#fff', fontWeight: 700 }}>${result.subtotal.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1' }}>
                          <span>VAT {result.vatPct}%</span><span style={{ color: '#fff', fontWeight: 700 }}>${result.vatAmount.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, paddingTop: 4, borderTop: '1px dashed rgba(255,255,255,0.1)', fontSize: 13, color: meta.color, fontWeight: 900 }}>
                          <span>Final</span><span>${result.finalPrice.toFixed(2)}</span>
                        </div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
                          unit: ${result.unitPrice.toFixed(4)}/{previewUnit} · margin: ${result.marginDollars.toFixed(2)} ({result.marginPctOfRevenue}%)
                        </div>
                      </div>
                    );
                  } catch (e) {
                    return (
                      <div key={r.channel} style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 8, padding: 10, fontSize: 11, color: '#f87171' }}>
                        {meta.label}: {e instanceof Error ? e.message : 'calc error'}
                      </div>
                    );
                  }
                })}
              </div>
            )}
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 10 }}>
              Math from <code style={{ background: 'rgba(245,197,24,0.1)', padding: '1px 5px', borderRadius: 4 }}>calculatePrice()</code> — same helper used by /pos, /products, /market, /checkout. DB function <code>bsc_calculate_price()</code> mirrors this exactly.
            </p>
          </div>
        </section>

        {/* Audit trail */}
        <section>
          <h2 style={h2}>📜 Audit trail · last {audit.length}</h2>
          {audit.length === 0 && <div style={{ ...card, color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>No changes recorded yet.</div>}
          {audit.length > 0 && (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ background: '#0a1628' }}>
                  <tr>
                    <th style={th}>When</th>
                    <th style={th}>Channel</th>
                    <th style={th}>Op</th>
                    <th style={{ ...th, textAlign: 'right' }}>Markup</th>
                    <th style={{ ...th, textAlign: 'right' }}>VAT</th>
                    <th style={th}>By</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a, i) => (
                    <tr key={a.id} style={{ background: i % 2 === 0 ? '#060d1f' : '#0a1628' }}>
                      <td style={td}>{new Date(a.changed_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', year: '2-digit' })}</td>
                      <td style={{ ...td, fontFamily: 'monospace', color: '#f5c518' }}>{a.channel}</td>
                      <td style={{ ...td, fontSize: 10, fontWeight: 800, color: a.operation === 'INSERT' ? '#4ade80' : a.operation === 'DELETE' ? '#f87171' : '#fbbf24' }}>{a.operation}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>
                        {a.operation === 'UPDATE' && a.old_markup_pct != null && a.new_markup_pct != null && a.old_markup_pct !== a.new_markup_pct ? (
                          <span><span style={{ color: '#94a3b8' }}>{Number(a.old_markup_pct).toFixed(2)}%</span> → <strong style={{ color: '#fff' }}>{Number(a.new_markup_pct).toFixed(2)}%</strong></span>
                        ) : a.new_markup_pct != null ? (
                          <strong style={{ color: '#fff' }}>{Number(a.new_markup_pct).toFixed(2)}%</strong>
                        ) : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>
                        {a.operation === 'UPDATE' && a.old_vat_pct != null && a.new_vat_pct != null && a.old_vat_pct !== a.new_vat_pct ? (
                          <span><span style={{ color: '#94a3b8' }}>{Number(a.old_vat_pct).toFixed(2)}%</span> → <strong style={{ color: '#fff' }}>{Number(a.new_vat_pct).toFixed(2)}%</strong></span>
                        ) : a.new_vat_pct != null ? (
                          <strong style={{ color: '#fff' }}>{Number(a.new_vat_pct).toFixed(2)}%</strong>
                        ) : '—'}
                      </td>
                      <td style={{ ...td, color: '#94a3b8', fontSize: 11 }}>{nameFor(a.changed_by)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {editing && (
        <RuleModal rule={editing} onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); setToast(msg); setTimeout(() => setToast(null), 4000); await load(); }} />
      )}
      {editConfig && (
        <ConfigModal row={editConfig} onClose={() => setEditConfig(null)}
          onSaved={async (msg) => { setEditConfig(null); setToast(msg); setTimeout(() => setToast(null), 4000); await load(); }} />
      )}
    </div>
  );
}

function RuleModal({ rule, onClose, onSaved }: { rule: PricingRule; onClose: () => void; onSaved: (msg: string) => Promise<void> }) {
  const [markup, setMarkup]   = useState(String(rule.markup_pct));
  const [vat, setVat]         = useState(String(rule.vat_pct));
  const [desc, setDesc]       = useState(rule.description);
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  async function submit() {
    const m = parseFloat(markup);
    const v = parseFloat(vat);
    if (!Number.isFinite(m) || m < 0 || m > 1000) { setErr('Markup must be 0-1000%'); return; }
    if (!Number.isFinite(v) || v < 0 || v > 100)  { setErr('VAT must be 0-100%'); return; }
    setBusy(true); setErr(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('pricing_rules').update({
      markup_pct:  m,
      vat_pct:     v,
      description: desc.trim() || rule.description,
      updated_at:  new Date().toISOString(),
      updated_by:  user?.id ?? null,
    }).eq('channel', rule.channel);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await onSaved(`✓ ${rule.channel.replace(/_/g, ' ')} updated to ${m}% markup / ${v}% VAT`);
  }

  return (
    <Modal title={`Edit ${rule.channel.replace(/_/g, ' ')}`} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Markup %"><input type="number" inputMode="decimal" step="0.01" min="0" max="1000" value={markup} onChange={e => setMarkup(e.target.value)} style={inp} autoFocus /></Field>
        <Field label="VAT %"><input type="number" inputMode="decimal" step="0.01" min="0" max="100" value={vat} onChange={e => setVat(e.target.value)} style={inp} /></Field>
      </div>
      <Field label="Description">
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }} />
      </Field>
      <p style={{ fontSize: 11, color: '#fbbf24', margin: '0 0 10px' }}>
        ⚠ Changes take effect immediately for ALL new sales (POS · online · admin Quick Sale). Existing product_pricing snapshots are NOT touched — re-price products on /products if you want them to reflect the new margin.
      </p>
      {err && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', color: '#f87171', padding: 8, borderRadius: 8, fontSize: 12, marginBottom: 8 }}>⚠ {err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onClose} style={{ ...btn, background: 'rgba(255,255,255,0.1)', color: '#fff', flex: 1 }}>Cancel</button>
        <button onClick={submit} disabled={busy} style={{ ...btn, background: '#f5c518', color: '#060d1f', flex: 2 }}>{busy ? 'Saving…' : '✓ Save (audited)'}</button>
      </div>
    </Modal>
  );
}

function ConfigModal({ row, onClose, onSaved }: { row: PricingConfigRow; onClose: () => void; onSaved: (msg: string) => Promise<void> }) {
  const [value, setValue] = useState(row.value);
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState<string | null>(null);

  async function submit() {
    if (!value.trim()) { setErr('Value required'); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.from('pricing_config').update({ value: value.trim() }).eq('key', row.key);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await onSaved(`✓ Config ${row.key} updated to ${value.trim()}`);
  }

  return (
    <Modal title={`Edit ${row.key}`} onClose={onClose}>
      <Field label="Value">
        <input value={value} onChange={e => setValue(e.target.value)} style={inp} autoFocus />
      </Field>
      {row.notes && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: '0 0 10px' }}>{row.notes}</p>}
      {err && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', color: '#f87171', padding: 8, borderRadius: 8, fontSize: 12, marginBottom: 8 }}>⚠ {err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onClose} style={{ ...btn, background: 'rgba(255,255,255,0.1)', color: '#fff', flex: 1 }}>Cancel</button>
        <button onClick={submit} disabled={busy} style={{ ...btn, background: '#f5c518', color: '#060d1f', flex: 2 }}>{busy ? 'Saving…' : '✓ Save'}</button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0b1628', borderRadius: 14, padding: 16, maxWidth: 480, width: '100%', marginTop: 32, border: '1px solid rgba(245,197,24,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", color: '#f5c518', margin: 0, fontSize: 18 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '6px 0 2px' };
const h2: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' };
const card: React.CSSProperties = { background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, color: '#fff' };
const lab: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 };
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14, boxSizing: 'border-box' };
const btn: React.CSSProperties = { border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer' };
const editBtn: React.CSSProperties = { background: 'rgba(245,197,24,0.12)', color: '#f5c518', border: '1px solid #f5c518', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.04)' };
