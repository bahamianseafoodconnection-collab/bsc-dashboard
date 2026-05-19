// POST /api/cashiers/variance-alert
//
// Fire-and-forget alert after a cashier shift closes. Server-side
// re-reads the session (so the client can't lie about the variance),
// checks whether the variance breached the threshold, and emails the
// admin recipient list via Resend.
//
// Thresholds (BSD cents):
//   SHORT alert: variance_cents < -500   (more than $5 short  → 🔴 urgent)
//   OVER  alert: variance_cents > 2000   (more than $20 over  → 🟠 watch)
//
// Recipients come from env CASHIER_VARIANCE_ALERT_EMAILS (comma sep).
// If unset, the call is a quiet no-op so close flows never block.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHORT_THRESHOLD_CENTS = -500;
const OVER_THRESHOLD_CENTS  = 2000;

interface Body { session_id: string; }

interface SessionRow {
  id:                          string;
  cashier_user_id:             string;
  location:                    string;
  status:                      string;
  opened_at:                   string;
  closed_at:                   string | null;
  opening_float_cents:         number;
  closing_cash_counted_cents:  number | null;
  variance_cents:              number | null;
  opening_notes:               string | null;
  closing_notes:               string | null;
  closed_by:                   string | null;
}

interface SessionTotals {
  cash_sales_cents:    number;
  card_sales_cents:    number;
  wire_sales_cents:    number;
  account_sales_cents: number;
  total_sales_cents:   number;
  order_count:         number;
}

function dollars(cents: number | null | undefined): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 });
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  if (!body.session_id) return NextResponse.json({ ok: false, error: 'session_id required' }, { status: 400 });

  // Read session + per-payment-method totals.
  const [{ data: session }, { data: totals }] = await Promise.all([
    admin.from('cash_drawer_sessions').select('*').eq('id', body.session_id).maybeSingle(),
    admin.from('cash_drawer_session_totals').select('cash_sales_cents, card_sales_cents, wire_sales_cents, account_sales_cents, total_sales_cents, order_count').eq('session_id', body.session_id).maybeSingle(),
  ]);
  if (!session) return NextResponse.json({ ok: false, error: 'session not found' }, { status: 404 });
  const s = session as SessionRow;
  if (s.status !== 'closed') return NextResponse.json({ ok: false, error: 'session not closed' }, { status: 400 });

  const variance = s.variance_cents ?? 0;
  const isShortAlert = variance < SHORT_THRESHOLD_CENTS;
  const isOverAlert  = variance > OVER_THRESHOLD_CENTS;
  if (!isShortAlert && !isOverAlert) {
    return NextResponse.json({ ok: true, alerted: false, reason: 'within tolerance', variance_cents: variance });
  }

  // Cashier + closer names
  const ids = [s.cashier_user_id, s.closed_by].filter(Boolean) as string[];
  const { data: profiles } = await admin.from('profiles').select('id, full_name').in('id', ids);
  const profMap: Record<string, string> = {};
  for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
    profMap[p.id] = p.full_name ?? '(unknown)';
  }
  const cashierName = profMap[s.cashier_user_id] ?? '(unknown cashier)';
  const closerName  = s.closed_by ? (profMap[s.closed_by] ?? '(unknown)') : '(cashier self)';

  // Recipients
  const list = (process.env.CASHIER_VARIANCE_ALERT_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean);
  if (list.length === 0) {
    return NextResponse.json({ ok: true, alerted: false, reason: 'no recipients configured (CASHIER_VARIANCE_ALERT_EMAILS empty)' });
  }

  const t = (totals ?? {}) as Partial<SessionTotals>;
  const expected = s.opening_float_cents + (t.cash_sales_cents ?? 0);
  const tone     = isShortAlert ? { color: '#9b1c1c', label: 'SHORT', badge: '🚨' } : { color: '#b45309', label: 'OVER', badge: '🟠' };
  const subject  = `${tone.badge} Drawer ${tone.label.toLowerCase()} — ${cashierName} · ${dollars(Math.abs(variance))} ${tone.label}`;
  const closedAt = s.closed_at ? new Date(s.closed_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#e2e8f0;font-family:'DM Sans',system-ui,sans-serif;color:#1a2e5a;">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 10px 30px -10px rgba(0,0,0,0.12);border-top:6px solid ${tone.color};">
    <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${tone.color};font-weight:900;">${tone.badge} Cashier drawer ${tone.label.toLowerCase()}</div>
    <h2 style="margin:6px 0 14px;font-size:22px;color:#1a2e5a;">${cashierName} · ${s.location}</h2>

    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#475569;">Closed at</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1a2e5a;">${closedAt}</td></tr>
      <tr><td style="padding:6px 0;color:#475569;">Closed by</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1a2e5a;">${closerName}</td></tr>
      <tr><td style="padding:6px 0;color:#475569;">Opening float</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1a2e5a;">${dollars(s.opening_float_cents)}</td></tr>
      <tr><td style="padding:6px 0;color:#475569;">Cash sales</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1a2e5a;">${dollars(t.cash_sales_cents)}</td></tr>
      <tr><td style="padding:6px 0;color:#475569;">Card sales</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1a2e5a;">${dollars(t.card_sales_cents)}</td></tr>
      <tr><td style="padding:6px 0;color:#475569;">Account sales</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1a2e5a;">${dollars(t.account_sales_cents)}</td></tr>
      <tr style="border-top:1px solid #e2e8f0;"><td style="padding:8px 0;color:#475569;">Expected cash on hand</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#1a2e5a;">${dollars(expected)}</td></tr>
      <tr><td style="padding:6px 0;color:#475569;">Counted cash</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#1a2e5a;">${dollars(s.closing_cash_counted_cents)}</td></tr>
      <tr style="border-top:2px solid ${tone.color};"><td style="padding:10px 0;font-weight:900;color:${tone.color};">Variance</td><td style="padding:10px 0;text-align:right;font-weight:900;color:${tone.color};font-size:20px;">${variance >= 0 ? '+' : ''}${dollars(variance)} ${tone.label}</td></tr>
    </table>

    ${s.closing_notes ? `<div style="background:#fffbeb;border:1px solid #f5c518;border-radius:8px;padding:10px;margin-top:14px;font-size:13px;color:#1a2e5a;"><strong>Notes:</strong> ${s.closing_notes}</div>` : ''}

    <p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:18px;">
      Open <a href="https://bscbahamas.com/dashboard/cashiers" style="color:#1a2e5a;">/dashboard/cashiers</a> for the full session detail.
    </p>
  </div>
</body></html>`;

  const results = await Promise.allSettled(list.map(to => sendEmail({ to, subject, html })));
  const sent = results.filter(r => r.status === 'fulfilled').length;
  return NextResponse.json({
    ok: true,
    alerted: true,
    kind: isShortAlert ? 'short' : 'over',
    variance_cents: variance,
    recipients_attempted: list.length,
    recipients_sent: sent,
  });
}
