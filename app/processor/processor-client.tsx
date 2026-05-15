'use client';

// app/processor/processor-client.tsx
// Processor workspace landing.
//
// View states:
//   - 'home'      : greeting, quick actions, recent batches, founder review queue
//   - 'new-batch' : the multi-output batch entry form
//
// Phase 4 additions (2026-05-08):
//   - "Start new batch" CTA → opens NewBatchForm (status='draft')
//   - Founder/co_founder see ApprovalQueue for draft batches awaiting review

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';
import NewBatchForm from './new-batch-form';
import ApprovalQueue from './approval-queue';

const NAVY = '#060e1c';
const PANEL = '#0f1a2e';
const GOLD = '#c8860f';
const GOLD_BRIGHT = '#f4c842';
const TEXT_DIM = 'rgba(255,255,255,0.55)';
const BORDER = 'rgba(255,255,255,0.08)';
const RED = '#f87171';
const GREEN = '#4ade80';

const APPROVER_ROLES = new Set(['founder', 'co_founder']);

type Batch = {
  id: string;
  batch_number: string | null;
  product_name: string | null;
  status: string | null;
  whole_weight_lb: number | null;
  finished_weight_lb: number | null;
  yield_pct: number | null;
  created_at: string | null;
};

function pickBatch(row: Record<string, unknown>): Batch {
  return {
    id: String(row.id ?? ''),
    batch_number: (row.batch_number as string) ?? null,
    product_name:
      (row.product_name as string) ??
      (row.name as string) ??
      (row.raw_product_name as string) ??
      null,
    status: (row.status as string) ?? null,
    whole_weight_lb:
      pickNumber(row.raw_weight_lbs) ??
      pickNumber(row.whole_weight_lb) ??
      pickNumber(row.input_weight_lb),
    finished_weight_lb:
      pickNumber(row.total_finished_weight_lbs) ??
      pickNumber(row.finished_weight_lb) ??
      pickNumber(row.output_weight_lb),
    yield_pct:
      pickNumber(row.yield_percent) ?? pickNumber(row.yield_pct),
    created_at: (row.created_at as string) ?? null,
  };
}

function pickNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function statusTone(s: string | null) {
  const v = (s ?? '').toLowerCase();
  if (v === 'completed' || v === 'approved') return GREEN;
  if (v === 'rejected' || v === 'reversed') return RED;
  if (v === 'in_progress' || v === 'draft') return GOLD_BRIGHT;
  return TEXT_DIM;
}

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type Props = {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  location: string | null;
};

type View = 'home' | 'new-batch';

export default function ProcessorClient({
  userId,
  email,
  displayName,
  role,
  location,
}: Props) {
  const [view, setView] = useState<View>('home');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const isApprover = APPROVER_ROLES.has(role);

  async function loadBatches() {
    setFetching(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('processing_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      setFetchError(plainError(error));
      setBatches([]);
    } else {
      setBatches((data || []).map((r) => pickBatch(r as Record<string, unknown>)));
    }
    setFetching(false);
  }

  useEffect(() => {
    loadBatches();
  }, []);

  const greeting = displayName ? `Good day, ${displayName}` : `Good day, processor`;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: NAVY,
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, "DM Sans", sans-serif',
        padding: '24px 16px 80px',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 3,
                color: GOLD,
                fontWeight: 700,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              BSC · Spiny Tail Processing
            </div>
            <h1
              style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 26,
                fontWeight: 700,
                margin: 0,
              }}
            >
              {greeting}
            </h1>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>
              {role}
              {location ? ` · ${location}` : ''} · {email}
            </div>
          </div>
          <Link
            href="/dashboard"
            style={{
              fontSize: 12,
              color: TEXT_DIM,
              textDecoration: 'none',
              padding: '6px 10px',
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
            }}
          >
            BSC Control →
          </Link>
        </div>

        {view === 'new-batch' && (
          <NewBatchForm
            userId={userId}
            onCancel={() => setView('home')}
            onSubmitted={() => {
              setView('home');
              loadBatches();
            }}
          />
        )}

        {view === 'home' && (
          <>
            {/* Quick actions */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
                marginBottom: 22,
              }}
            >
              <button
                type="button"
                onClick={() => setView('new-batch')}
                style={{
                  background: GOLD_BRIGHT,
                  color: NAVY,
                  border: 'none',
                  borderRadius: 14,
                  padding: 16,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>＋</div>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>
                  Start new batch
                </div>
                <div style={{ fontSize: 11, color: 'rgba(6,14,28,0.7)' }}>
                  Raw → finished, sent for founder review
                </div>
              </button>

              <ActionCard
                href="/inventory/scan"
                title="Receive raw stock"
                sub="Scan or type a barcode"
                emoji="📥"
              />
              <ActionCard
                href="/yield"
                title="Calculate yield"
                sub="Lot label + channel pricing"
                emoji="⚖️"
              />
              <ActionCard
                href="/inventory"
                title="Freezer inventory"
                sub="See current stock"
                emoji="🧊"
              />
            </div>

            {/* Founder approval queue (only visible to founder/co_founder) */}
            {isApprover && (
              <div style={{ marginBottom: 22 }}>
                <ApprovalQueue onChanged={loadBatches} />
              </div>
            )}

            {/* Recent batches */}
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
                    letterSpacing: 0.5,
                  }}
                >
                  Recent processing batches
                </h2>
                <button
                  type="button"
                  onClick={loadBatches}
                  disabled={fetching}
                  style={{
                    background: 'transparent',
                    color: TEXT_DIM,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 8,
                    padding: '5px 10px',
                    fontSize: 11,
                    cursor: fetching ? 'not-allowed' : 'pointer',
                  }}
                >
                  {fetching ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {fetching && (
                <p style={{ color: TEXT_DIM, fontSize: 13, margin: 0 }}>
                  Loading batches…
                </p>
              )}

              {!fetching && fetchError && (
                <div
                  style={{
                    background: 'rgba(248,113,113,0.08)',
                    border: `1px solid ${RED}33`,
                    color: RED,
                    borderRadius: 10,
                    padding: '12px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  ⚠️ Could not load batches: {fetchError}
                </div>
              )}

              {!fetching && !fetchError && batches.length === 0 && (
                <p style={{ color: TEXT_DIM, fontSize: 13, margin: 0 }}>
                  No processing batches yet. Hit “Start new batch” above to log
                  your first one.
                </p>
              )}

              {!fetching && !fetchError && batches.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {batches.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${BORDER}`,
                        borderRadius: 10,
                        padding: '12px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#fff',
                            marginBottom: 2,
                          }}
                        >
                          {b.product_name || 'Unnamed batch'}
                        </div>
                        <div style={{ fontSize: 11, color: TEXT_DIM }}>
                          {b.batch_number || b.id.slice(0, 8)}
                          {b.created_at ? ` · ${timeAgo(b.created_at)}` : ''}
                        </div>
                      </div>

                      {(b.whole_weight_lb !== null || b.finished_weight_lb !== null) && (
                        <div
                          style={{
                            fontSize: 11,
                            color: TEXT_DIM,
                            textAlign: 'right',
                          }}
                        >
                          {b.whole_weight_lb !== null && (
                            <div>in: {b.whole_weight_lb.toFixed(1)} lb</div>
                          )}
                          {b.finished_weight_lb !== null && (
                            <div>out: {b.finished_weight_lb.toFixed(1)} lb</div>
                          )}
                          {b.yield_pct !== null && (
                            <div style={{ color: '#fff', fontWeight: 700 }}>
                              {b.yield_pct.toFixed(1)}%
                            </div>
                          )}
                        </div>
                      )}

                      {b.status && (
                        <span
                          style={{
                            fontSize: 10,
                            letterSpacing: 1,
                            textTransform: 'uppercase',
                            fontWeight: 800,
                            padding: '4px 8px',
                            borderRadius: 999,
                            color: NAVY,
                            background: statusTone(b.status),
                          }}
                        >
                          {b.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ActionCard({
  href,
  title,
  sub,
  emoji,
}: {
  href: string;
  title: string;
  sub: string;
  emoji: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        background: PANEL,
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        padding: 16,
        textDecoration: 'none',
        color: '#fff',
      }}
    >
      <div style={{ fontSize: 22, marginBottom: 6 }}>{emoji}</div>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11, color: TEXT_DIM }}>{sub}</div>
    </Link>
  );
}
