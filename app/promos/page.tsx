'use client';

// app/promos/page.tsx
//
// Staff console for promo codes. Lists all codes with usage + validity,
// lets staff create new codes, toggle active, and view recent redemptions.
// Inline styles to match the rest of the back-office UI (per Sacred BSC
// rules: public pages use Tailwind, internal staff tools use inline styles).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';

export const dynamic = 'force-dynamic';

type Promo = {
  id: string;
  created_at: string;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_subtotal: number | null;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  uses_count: number;
  single_use_per_customer: boolean;
  active: boolean;
};

type Redemption = {
  id: string;
  created_at: string;
  promo_code: string;
  order_id: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  applied_amount: number;
};

export default function PromosPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form state
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('10');
  const [minSubtotal, setMinSubtotal] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [singleUse, setSingleUse] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const [{ data: pData, error: pErr }, { data: rData }] = await Promise.all([
      supabase.from('promo_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('promo_redemptions').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    if (pErr) setError(plainError(pErr));
    setPromos((pData || []) as Promo[]);
    setRedemptions((rData || []) as Redemption[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createPromo(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmed = code.trim().toUpperCase();
    const value = Number(discountValue);
    if (!trimmed) { setFormError('Code is required'); return; }
    if (!Number.isFinite(value) || value <= 0) { setFormError('Discount must be a positive number'); return; }
    if (discountType === 'percent' && value > 100) { setFormError('Percent must be 1–100'); return; }
    setBusy(true);
    const { error: insErr } = await supabase.from('promo_codes').insert({
      code: trimmed,
      description: description.trim() || null,
      discount_type: discountType,
      discount_value: value,
      min_subtotal: minSubtotal ? Number(minSubtotal) : null,
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      max_uses: maxUses ? Number(maxUses) : null,
      single_use_per_customer: singleUse,
      active: true,
    });
    setBusy(false);
    if (insErr) {
      setFormError(insErr.message);
      return;
    }
    setShowForm(false);
    setCode(''); setDescription(''); setDiscountValue('10');
    setMinSubtotal(''); setValidUntil(''); setMaxUses(''); setSingleUse(false);
    load();
  }

  async function toggleActive(p: Promo) {
    await supabase
      .from('promo_codes')
      .update({ active: !p.active, updated_at: new Date().toISOString() })
      .eq('id', p.id);
    load();
  }

  async function deletePromo(p: Promo) {
    if (!confirm(`Delete code ${p.code}? This cannot be undone.`)) return;
    await supabase.from('promo_codes').delete().eq('id', p.id);
    load();
  }

  const totals = useMemo(() => {
    const totalUses = redemptions.length;
    const totalDiscount = redemptions.reduce((s, r) => s + Number(r.applied_amount || 0), 0);
    return { totalUses, totalDiscount };
  }, [redemptions]);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0 }}>Promo codes</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            background: showForm ? '#4b5563' : '#f5c518',
            color: showForm ? '#fff' : '#060d1f',
            border: 'none',
            borderRadius: 8,
            padding: '8px 14px',
            fontWeight: 800,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {showForm ? 'Cancel' : '+ New code'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10, marginBottom: 14 }}>
        <Stat label="Active codes" value={promos.filter((p) => p.active).length} />
        <Stat label="Total uses" value={totals.totalUses} />
        <Stat label="Discount given" value={totals.totalDiscount} money />
      </div>

      {error && <ErrorBox text={error} migration="sql/2026-05-09-promo-codes.sql" />}

      {showForm && (
        <form onSubmit={createPromo} style={formCardStyle}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#f5c518', marginBottom: 10 }}>
            New promo code
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE (e.g. WELCOME10)"
            style={inputStyle}
            maxLength={32}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional, internal)"
            style={inputStyle}
            maxLength={120}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'percent' | 'fixed')}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="percent">% off</option>
              <option value="fixed">BSD $ off</option>
            </select>
            <input
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === 'percent' ? '10' : '5.00'}
              style={{ ...inputStyle, flex: 1 }}
              type="number"
              min={0}
              step={discountType === 'percent' ? 1 : 0.01}
            />
          </div>
          <input
            value={minSubtotal}
            onChange={(e) => setMinSubtotal(e.target.value)}
            placeholder="Min subtotal BSD (optional)"
            style={inputStyle}
            type="number"
            min={0}
            step={0.01}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              placeholder="Expires (optional)"
              style={{ ...inputStyle, flex: 1 }}
              type="date"
            />
            <input
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Max uses (optional)"
              style={{ ...inputStyle, flex: 1 }}
              type="number"
              min={1}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={singleUse}
              onChange={(e) => setSingleUse(e.target.checked)}
            />
            One use per customer (by email/phone)
          </label>
          {formError && (
            <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{formError}</div>
          )}
          <button
            type="submit"
            disabled={busy}
            style={{
              background: '#f5c518',
              color: '#060d1f',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              fontWeight: 900,
              fontSize: 13,
              cursor: 'pointer',
              opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? 'Creating…' : 'Create code'}
          </button>
        </form>
      )}

      <div style={{ marginTop: 8 }}>
        {loading && <div style={{ color: '#94a3b8', padding: 12 }}>Loading…</div>}
        {!loading && promos.length === 0 && (
          <div style={{ color: '#94a3b8', padding: 12, textAlign: 'center' }}>
            No promo codes yet. Click + New code to create one.
          </div>
        )}
        {promos.map((p) => {
          const expired = p.valid_until ? new Date(p.valid_until) < new Date() : false;
          const exhausted = p.max_uses != null && p.uses_count >= p.max_uses;
          const status = !p.active ? 'inactive' : expired ? 'expired' : exhausted ? 'used up' : 'active';
          const tone =
            status === 'active'   ? '#22c55e' :
            status === 'expired'  ? '#f87171' :
            status === 'used up'  ? '#a78bfa' :
            '#94a3b8';
          const valueLabel =
            p.discount_type === 'percent'
              ? `${p.discount_value}% off`
              : `BSD $${Number(p.discount_value).toFixed(2)} off`;
          return (
            <div key={p.id} style={{ ...cardStyle, borderLeft: `4px solid ${tone}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>
                    {p.code}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {valueLabel}
                    {p.min_subtotal && ` · min BSD $${Number(p.min_subtotal).toFixed(2)}`}
                    {p.valid_until && ` · expires ${p.valid_until.slice(0, 10)}`}
                  </div>
                  {p.description && (
                    <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4, fontStyle: 'italic' }}>
                      {p.description}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800, padding: '4px 8px', borderRadius: 999, color: '#060d1f', background: tone }}>
                  {status}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {p.uses_count} use{p.uses_count === 1 ? '' : 's'}
                  {p.max_uses != null && ` of ${p.max_uses}`}
                  {p.single_use_per_customer && ' · 1 per customer'}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => toggleActive(p)}
                    style={miniBtn(p.active ? '#94a3b8' : '#22c55e')}
                  >
                    {p.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => deletePromo(p)}
                    style={miniBtn('#f87171')}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {redemptions.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#f5c518', marginTop: 18, marginBottom: 8 }}>
            Recent redemptions
          </div>
          {redemptions.slice(0, 20).map((r) => (
            <div key={r.id} style={{ ...cardStyle, padding: '8px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#fff', fontFamily: 'monospace' }}>
                  {r.promo_code}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e' }}>
                  −BSD ${Number(r.applied_amount).toFixed(2)}
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                {r.customer_email || r.customer_phone || 'guest'} · {r.created_at.slice(0, 16).replace('T', ' ')}
                {r.order_id && ` · order #${r.order_id.slice(0, 8)}`}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, money = false }: { label: string; value: number; money?: boolean }) {
  return (
    <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: '#f5c518', marginTop: 2 }}>
        {money ? `$${value.toFixed(2)}` : value}
      </div>
    </div>
  );
}

function ErrorBox({ text, migration }: { text: string; migration?: string }) {
  return (
    <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
      ⚠️ {text}
      {migration && (text.toLowerCase().includes('relation') || text.toLowerCase().includes('does not exist')) && (
        <div style={{ marginTop: 6 }}>Run {migration} in the Supabase SQL editor.</div>
      )}
    </div>
  );
}

function miniBtn(color: string): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${color}`,
    color,
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  };
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 720, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '12px 14px', border: '1px solid #1e3a5f', marginBottom: 10 };
const formCardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: 14, border: '1px solid #1e3a5f', marginTop: 10, marginBottom: 14 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
