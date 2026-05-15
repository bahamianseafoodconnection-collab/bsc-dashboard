'use client';

// app/processor/approval-queue.tsx
//
// Founder / co_founder reviews draft processing batches.
// Approve / Reject each one — both calls go through the role-gated
// /api/processor/batches/approve endpoint.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';

const PANEL = '#0f1a2e';
const GOLD = '#c8860f';
const GOLD_BRIGHT = '#f4c842';
const TEXT_DIM = 'rgba(255,255,255,0.55)';
const BORDER = 'rgba(255,255,255,0.08)';
const RED = '#f87171';
const GREEN = '#4ade80';
const NAVY = '#060e1c';

type Draft = {
  id: string;
  batch_number: string | null;
  raw_product_id: string | null;
  raw_weight_lbs: number | null;
  total_finished_weight_lbs: number | null;
  total_waste_weight_lbs: number | null;
  yield_percent: number | null;
  raw_cost_total: number | null;
  effective_cost_per_finished_lb: number | null;
  notes: string | null;
  created_at: string | null;
  created_by: string | null;
};

type ProductMap = Record<string, string>;

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ApprovalQueue({ onChanged }: { onChanged?: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [productNames, setProductNames] = useState<ProductMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // per-batch action state
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('processing_batches')
      .select(
        'id, batch_number, raw_product_id, raw_weight_lbs, total_finished_weight_lbs, total_waste_weight_lbs, yield_percent, raw_cost_total, effective_cost_per_finished_lb, notes, created_at, created_by'
      )
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(50);
    if (err) {
      setError(plainError(err));
      setDrafts([]);
      setLoading(false);
      return;
    }
    const rows = (data || []) as Draft[];
    setDrafts(rows);

    const productIds = Array.from(
      new Set(rows.map((d) => d.raw_product_id).filter((x): x is string => !!x))
    );
    if (productIds.length > 0) {
      const { data: prods } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds);
      const map: ProductMap = {};
      (prods || []).forEach((p) => {
        map[p.id as string] = (p.name as string) ?? '';
      });
      setProductNames(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(batchId: string, decision: 'approved' | 'rejected', notes?: string) {
    setBusyId(batchId);
    setActionError(null);
    try {
      const res = await fetch('/api/processor/batches/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, decision, notes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setActionError(json.error || `${decision} failed`);
        setBusyId(null);
        return;
      }
      setRejectingId(null);
      setRejectNote('');
      await load();
      onChanged?.();
    } catch {
      setActionError('Network error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      style={{
        background: PANEL,
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 12,
        }}
      >
        <h2
          style={{
            fontSize: 14,
            fontWeight: 800,
            margin: 0,
            color: '#fff',
          }}
        >
          Founder approval queue
          {drafts.length > 0 && (
            <span style={{ color: GOLD, marginLeft: 8 }}>· {drafts.length}</span>
          )}
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            background: 'transparent',
            color: TEXT_DIM,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 11,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {actionError && (
        <div
          style={{
            background: 'rgba(248,113,113,0.08)',
            border: `1px solid ${RED}33`,
            color: RED,
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          ⚠️ {actionError}
        </div>
      )}

      {loading && (
        <p style={{ color: TEXT_DIM, fontSize: 13, margin: 0 }}>Loading draft batches…</p>
      )}

      {!loading && error && (
        <div
          style={{
            background: 'rgba(248,113,113,0.08)',
            border: `1px solid ${RED}33`,
            color: RED,
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          ⚠️ Could not load drafts: {error}
        </div>
      )}

      {!loading && !error && drafts.length === 0 && (
        <p style={{ color: TEXT_DIM, fontSize: 13, margin: 0 }}>
          No batches awaiting approval.
        </p>
      )}

      {!loading && !error && drafts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {drafts.map((d) => {
            const productName =
              (d.raw_product_id && productNames[d.raw_product_id]) || 'Unknown product';
            const isRejecting = rejectingId === d.id;
            const busy = busyId === d.id;
            return (
              <div
                key={d.id}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 8,
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#fff',
                      }}
                    >
                      {productName}
                    </div>
                    <div style={{ fontSize: 11, color: TEXT_DIM }}>
                      {d.batch_number || d.id.slice(0, 8)}
                      {d.created_at ? ` · submitted ${timeAgo(d.created_at)}` : ''}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      fontWeight: 800,
                      padding: '4px 8px',
                      borderRadius: 999,
                      color: NAVY,
                      background: GOLD_BRIGHT,
                    }}
                  >
                    Draft
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                    gap: 8,
                    fontSize: 12,
                    color: TEXT_DIM,
                    marginBottom: 12,
                  }}
                >
                  <Stat label="In"           value={fmtLb(d.raw_weight_lbs)} />
                  <Stat label="Out"          value={fmtLb(d.total_finished_weight_lbs)} />
                  <Stat label="Waste"        value={fmtLb(d.total_waste_weight_lbs)} />
                  <Stat
                    label="Yield"
                    value={d.yield_percent != null ? `${d.yield_percent.toFixed(1)}%` : '—'}
                    highlight
                  />
                  <Stat
                    label="Raw cost"
                    value={d.raw_cost_total != null ? `$${d.raw_cost_total.toFixed(2)}` : '—'}
                  />
                  <Stat
                    label="$/finished lb"
                    value={
                      d.effective_cost_per_finished_lb != null
                        ? `$${d.effective_cost_per_finished_lb.toFixed(2)}`
                        : '—'
                    }
                    highlight
                  />
                </div>

                {d.notes && (
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontSize: 12,
                      color: TEXT_DIM,
                      marginBottom: 10,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {d.notes}
                  </div>
                )}

                {isRejecting ? (
                  <div>
                    <textarea
                      autoFocus
                      rows={2}
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="Why is this batch being rejected?"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: `1.5px solid ${BORDER}`,
                        background: 'rgba(255,255,255,0.04)',
                        color: '#fff',
                        fontSize: 13,
                        outline: 'none',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectNote('');
                        }}
                        disabled={busy}
                        style={btnGhost(busy)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(d.id, 'rejected', rejectNote)}
                        disabled={busy || !rejectNote.trim()}
                        style={btnDanger(busy || !rejectNote.trim())}
                      >
                        {busy ? 'Sending…' : 'Confirm reject'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingId(d.id);
                        setRejectNote('');
                      }}
                      disabled={busy}
                      style={btnGhost(busy)}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(d.id, 'approved')}
                      disabled={busy}
                      style={btnApprove(busy)}
                    >
                      {busy ? 'Approving…' : 'Approve'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmtLb(n: number | null): string {
  if (n == null) return '—';
  return `${n.toFixed(1)} lb`;
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: TEXT_DIM, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: highlight ? GOLD_BRIGHT : '#fff',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function btnGhost(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '10px 0',
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    background: 'transparent',
    color: TEXT_DIM,
    fontWeight: 700,
    fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
function btnDanger(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '10px 0',
    borderRadius: 8,
    border: 'none',
    background: disabled ? '#4b5563' : RED,
    color: '#fff',
    fontWeight: 800,
    fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
function btnApprove(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '10px 0',
    borderRadius: 8,
    border: 'none',
    background: disabled ? '#4b5563' : GREEN,
    color: NAVY,
    fontWeight: 900,
    fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
