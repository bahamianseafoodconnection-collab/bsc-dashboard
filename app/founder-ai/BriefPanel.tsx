'use client'

// app/founder-ai/BriefPanel.tsx
//
// On-demand operational brief panel for the Founder AI page.
//
// Self-contained: a floating "Today's Brief" button that opens a slide-in
// panel, fetches /api/founder-ai/brief with the signed-in user's bearer
// token, and renders the brief in BSC navy/gold. Founder/co-founder gating
// happens server-side in the endpoint — this just shows whatever it returns
// (or the 403 message if the caller isn't authorised).
//
// Wiring into page.tsx is two lines: `import BriefPanel from './BriefPanel'`
// and `<BriefPanel />` near the end of the returned tree.

import { useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

let _sb: ReturnType<typeof createBrowserClient> | null = null
function sb() {
  if (!_sb) {
    _sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return _sb
}

type Range = 'today' | '7d' | 'mtd'

interface Brief {
  ok: boolean
  generated_at: string
  range: { key: string; label: string; from: string; to: string }
  summary: {
    orders: number; revenue: number; cogs_revenue_basis: number
    gross_profit: number; gross_margin_pct: number; net_profit: number
    cost_confidence: { revenue_without_cost: number; note: string; orders_missing_net_profit: number }
  }
  sales: {
    wholesale: { orders: number; revenue: number }
    retail: { orders: number; revenue: number }
    by_channel: Array<{ channel: string; orders: number; revenue: number }>
  }
  customers: {
    identified: number; returning: number; new: number; walk_in_orders: number
    list: Array<{ name: string; orders: number; revenue: number; products: string[]; is_returning: boolean }>
  }
  suppliers: Array<{ supplier: string; revenue: number; cogs: number; gross_profit: number; qty: number; lines: number }>
  pos: {
    sessions: Array<{
      cashier: string; location: string | null; status: string | null; orders: number
      cash_sales: number; card_sales: number; wire_sales: number; account_sales: number
      total_sales: number; opening_float: number; expected_cash: number
      counted_cash: number | null; variance: number | null
    }>
    card_takings_total: number
  }
  reorder: Array<{ name: string | null; sku: string | null; on_hand: number | null; reorder_point: number | null }>
  meta: { orders_awaiting_reconciliation: number; scope: string }
}

const GOLD = '#f5c518'
const NAVY = '#060d1f'

function fmt(n: number) {
  return (n < 0 ? '−$' : '$') + Math.abs(n).toFixed(2)
}

export default function BriefPanel() {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<Range>('today')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [brief, setBrief] = useState<Brief | null>(null)

  const load = useCallback(async (r: Range) => {
    setLoading(true); setError(null)
    try {
      const { data: { session } } = await sb().auth.getSession()
      const token = session?.access_token
      if (!token) { setError('Please sign in to view the brief.'); setLoading(false); return }
      const res = await fetch(`/api/founder-ai/brief?range=${r}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.ok) { setError(data.error || `Error ${res.status}`); setBrief(null) }
      else setBrief(data as Brief)
    } catch (e) {
      setError('Could not load brief. Try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  function openPanel() {
    setOpen(true)
    if (!brief) load(range)
  }

  function pickRange(r: Range) {
    setRange(r); load(r)
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={openPanel}
        style={{
          position: 'fixed', right: 16, bottom: 96, zIndex: 200,
          background: `linear-gradient(135deg, ${GOLD}, #e6b000)`, color: NAVY,
          border: 'none', borderRadius: 14, padding: '12px 16px', fontWeight: 800,
          fontSize: 13, cursor: 'pointer', boxShadow: '0 6px 18px rgba(245,197,24,0.35)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
        title="Today's operational brief"
      >
        📊 Today&apos;s Brief
      </button>

      {!open ? null : (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: 0, right: 0, height: '100%', width: '100%', maxWidth: 560,
              background: NAVY, borderLeft: `1px solid rgba(245,197,24,0.2)`,
              display: 'flex', flexDirection: 'column', color: '#fff',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {/* Header */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700 }}>
                  Operational <span style={{ color: GOLD }}>Brief</span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                  {brief ? `${brief.range.label} · generated ${new Date(brief.generated_at).toLocaleString()}` : 'Founder / co-founder only'}
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 26, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {/* Range tabs */}
            <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {(['today', '7d', 'mtd'] as Range[]).map(r => (
                <button key={r} onClick={() => pickRange(r)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: range === r ? 'none' : '1px solid rgba(255,255,255,0.12)',
                    background: range === r ? GOLD : 'transparent',
                    color: range === r ? NAVY : 'rgba(255,255,255,0.7)',
                  }}>
                  {r === 'today' ? 'Today' : r === '7d' ? '7 days' : 'Month'}
                </button>
              ))}
              <button onClick={() => load(range)} title="Refresh"
                style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: GOLD, cursor: 'pointer', fontSize: 13 }}>
                ↻
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
              {loading && <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Loading brief…</div>}
              {error && !loading && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: 14, fontSize: 13, color: '#fca5a5' }}>{error}</div>
              )}
              {brief && !loading && !error && <BriefBody brief={brief} />}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function BriefBody({ brief }: { brief: Brief }) {
  const s = brief.summary
  const profitColor = s.gross_profit < 0 ? '#fca5a5' : '#86efac'
  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        <Card label="Orders" value={String(s.orders)} />
        <Card label="Revenue" value={fmt(s.revenue)} />
        <Card label="Gross profit" value={fmt(s.gross_profit)} sub={`${s.gross_margin_pct}% margin`} color={profitColor} />
        <Card label="Net profit" value={fmt(s.net_profit)} sub="after overhead + Bill 5%" color={s.net_profit < 0 ? '#fca5a5' : '#86efac'} />
      </div>

      {/* Confidence flag — honesty */}
      {(s.cost_confidence.revenue_without_cost > 0 || s.cost_confidence.orders_missing_net_profit > 0) && (
        <div style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
          <strong style={{ color: GOLD }}>Data confidence:</strong> {s.cost_confidence.note}
          {s.cost_confidence.revenue_without_cost > 0 && <> ({fmt(s.cost_confidence.revenue_without_cost)} of revenue)</>}
          {s.cost_confidence.orders_missing_net_profit > 0 && <> · {s.cost_confidence.orders_missing_net_profit} order(s) missing net profit.</>}
        </div>
      )}

      {/* Sales split */}
      <Section title="Sales — wholesale vs retail">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <Card label={`Wholesale (${brief.sales.wholesale.orders})`} value={fmt(brief.sales.wholesale.revenue)} />
          <Card label={`Retail (${brief.sales.retail.orders})`} value={fmt(brief.sales.retail.revenue)} />
        </div>
        {brief.sales.by_channel.map(c => (
          <Row key={c.channel} left={c.channel} mid={`${c.orders} ord`} right={fmt(c.revenue)} />
        ))}
      </Section>

      {/* Supplier share */}
      <Section title="Supplier share (origin · spend · profit)">
        {brief.suppliers.length === 0 ? <Empty text="No supplier lines in range." /> :
          brief.suppliers.map(sup => (
            <div key={sup.supplier} style={rowBox}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sup.supplier}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{sup.qty} units · COGS {fmt(sup.cogs)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>{fmt(sup.revenue)}</div>
                <div style={{ fontSize: 11, color: sup.gross_profit < 0 ? '#fca5a5' : '#86efac' }}>+{fmt(sup.gross_profit)}</div>
              </div>
            </div>
          ))}
      </Section>

      {/* Customers */}
      <Section title={`Customers (${brief.customers.identified} · ${brief.customers.returning} return / ${brief.customers.new} new · ${brief.customers.walk_in_orders} walk-in)`}>
        {brief.customers.list.length === 0 ? <Empty text="No identified customers in range." /> :
          brief.customers.list.map((c, i) => (
            <div key={i} style={rowBox}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                  {c.name}
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, marginLeft: 6, fontWeight: 800, background: c.is_returning ? 'rgba(134,239,172,0.15)' : 'rgba(245,197,24,0.15)', color: c.is_returning ? '#86efac' : GOLD }}>
                    {c.is_returning ? 'RETURN' : 'NEW'}
                  </span>
                </div>
                {c.products.length > 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.products.join(', ')}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>{fmt(c.revenue)}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{c.orders} ord</div>
              </div>
            </div>
          ))}
      </Section>

      {/* POS drawers */}
      <Section title={`POS drawers · card takings ${fmt(brief.pos.card_takings_total)}`}>
        {brief.pos.sessions.length === 0 ? <Empty text="No drawer sessions in range." /> :
          brief.pos.sessions.map((p, i) => (
            <div key={i} style={{ ...rowBox, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                  {p.cashier}
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, marginLeft: 6, fontWeight: 800, background: p.status === 'open' ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.08)', color: p.status === 'open' ? '#60a5fa' : 'rgba(255,255,255,0.5)' }}>
                    {(p.status || '').toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>{fmt(p.total_sales)}</div>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                Cash {fmt(p.cash_sales)} · Card {fmt(p.card_sales)} · Wire {fmt(p.wire_sales)} · {p.orders} ord
              </div>
              {p.variance != null && (
                <div style={{ fontSize: 11, color: Math.abs(p.variance) < 0.005 ? '#86efac' : '#fca5a5' }}>
                  Drawer: expected {fmt(p.expected_cash)} · counted {p.counted_cash == null ? '—' : fmt(p.counted_cash)} · variance {fmt(p.variance)}
                </div>
              )}
            </div>
          ))}
      </Section>

      {/* Reorder */}
      <Section title={`Inventory reorder (${brief.reorder.length})`}>
        {brief.reorder.length === 0 ? <Empty text="Nothing below reorder point." /> :
          <>
            {brief.reorder.map((r, i) => (
              <Row key={i} left={r.name || r.sku || 'item'} mid={r.sku || ''} right={`${r.on_hand ?? '—'} / ${r.reorder_point ?? '—'}`} />
            ))}
            <a href="/purchase-orders" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: GOLD, textDecoration: 'none', borderBottom: `1px dashed ${GOLD}` }}>
              → Open Purchase Orders to raise a PO
            </a>
          </>}
      </Section>

      {/* Meta */}
      {brief.meta.orders_awaiting_reconciliation > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: 12, fontSize: 12, color: '#fca5a5' }}>
          ⚠ {brief.meta.orders_awaiting_reconciliation} order(s) awaiting reconciliation — sales/profit above may undercount until reconciled.
        </div>
      )}
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 16, textAlign: 'center' }}>{brief.meta.scope}</div>
    </div>
  )
}

const rowBox: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
}

function Card({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'rgba(255,255,255,0.4)' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 900, color: color || '#fff', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function Row({ left, mid, right }: { left: string; mid?: string; right: string }) {
  return (
    <div style={rowBox}>
      <div style={{ flex: 1, fontSize: 13, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</div>
      {mid ? <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{mid}</div> : null}
      <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginLeft: 10 }}>{right}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', padding: '6px 0' }}>{text}</div>
}
