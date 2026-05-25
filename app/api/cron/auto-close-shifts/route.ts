// app/api/cron/auto-close-shifts/route.ts
//
// Phase 2c: belt-and-suspenders for the Phase 2a 10h shift cap.
// /pos already blocks new sales past 10h on the cashier client side
// (Item 7 alert), but if the cashier just walks away without closing
// their drawer, the open session lingers indefinitely. This cron sweeps
// every 15 minutes, finds sessions opened > 10h ago, and auto-closes
// them so dashboards / reconciliation queues stay current.
//
// Auto-closed shifts are marked with:
//   status                     = 'closed'
//   closed_at                  = NOW()
//   closing_notes              = '<existing> · [AUTO-CLOSED ...]'
//   closing_cash_counted_cents = NULL (admin reconciles via "Close on
//                                      behalf" at /dashboard/cashiers)
//   variance_cents             = NULL (no count → no variance)
//   closed_by                  = NULL (system close, not a user)
//
// Side effect: when ≥ 1 session auto-closed, ONE batched email goes to
// CASHIER_VARIANCE_ALERT_EMAILS with the list so the reconciliation
// queue is visible to the founder.
//
// Trigger: Vercel cron at */15 * * * *. CRON_SECRET in Authorization
// header (same pattern as /api/ar/aging-alert, /api/notifications/send).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHIFT_MAX_HOURS = 10;

interface OpenSession {
  id:                  string;
  cashier_user_id:     string;
  location:            string;
  opened_at:           string;
  opening_float_cents: number;
  closing_notes:       string | null;
}
interface CashierProfile { id: string; full_name: string | null; }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

async function processAutoClose(): Promise<NextResponse> {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) {
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
  }
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Find all open sessions older than 10 hours.
  const cutoff = new Date(Date.now() - SHIFT_MAX_HOURS * 60 * 60 * 1000).toISOString();
  const { data: stale, error: sErr } = await admin
    .from('cash_drawer_sessions')
    .select('id, cashier_user_id, location, opened_at, opening_float_cents, closing_notes')
    .eq('status', 'open')
    .lt('opened_at', cutoff);
  if (sErr) {
    return NextResponse.json({ ok: false, error: `Read failed: ${sErr.message}` }, { status: 500 });
  }
  const sessions = (stale ?? []) as OpenSession[];
  if (sessions.length === 0) {
    return NextResponse.json({ ok: true, auto_closed: 0, note: 'no stale shifts' });
  }

  const nowIso = new Date().toISOString();
  const tag = `[AUTO-CLOSED ${nowIso.slice(0, 16)}Z — shift exceeded ${SHIFT_MAX_HOURS}h cap. Reconcile manually: count drawer + use Close-on-behalf at /dashboard/cashiers]`;

  // Per-session UPDATE with race guard: only close if still 'open'.
  // (Avoids double-firing if a cashier closes the shift between the
  // SELECT above and the UPDATE here.)
  const closedIds: string[] = [];
  for (const s of sessions) {
    const newNotes = s.closing_notes ? `${s.closing_notes} · ${tag}` : tag;
    const { error: uErr, data: updated } = await admin
      .from('cash_drawer_sessions')
      .update({
        status:        'closed',
        closed_at:     nowIso,
        closing_notes: newNotes,
        updated_at:    nowIso,
      })
      .eq('id', s.id)
      .eq('status', 'open')   // race guard
      .select('id');
    if (uErr) {
      console.warn(`auto-close-shifts: failed to close session ${s.id}: ${uErr.message}`);
      continue;
    }
    if (updated && updated.length > 0) closedIds.push(s.id);
  }

  if (closedIds.length === 0) {
    return NextResponse.json({
      ok: true,
      auto_closed: 0,
      attempted: sessions.length,
      note: 'all updates raced (cashier closed manually) or errored',
    });
  }

  // Batched email — single send to all admin recipients with the full
  // list of auto-closed shifts. Quiet no-op if CASHIER_VARIANCE_ALERT_EMAILS
  // is unset (matches the variance-alert pattern at /api/cashiers/variance-alert).
  const recipients = (process.env.CASHIER_VARIANCE_ALERT_EMAILS ?? '')
    .split(',').map(e => e.trim()).filter(Boolean);

  let emailSent = 0;
  if (recipients.length > 0) {
    const closedSessions = sessions.filter(s => closedIds.includes(s.id));
    const ids = Array.from(new Set(closedSessions.map(s => s.cashier_user_id)));
    const { data: profs } = await admin.from('profiles').select('id, full_name').in('id', ids);
    const profMap: Record<string, string> = {};
    for (const p of (profs ?? []) as CashierProfile[]) profMap[p.id] = p.full_name ?? '(unknown)';

    const rows = closedSessions.map(s => {
      const cashierName = escapeHtml(profMap[s.cashier_user_id] ?? '(unknown)');
      const location    = escapeHtml(s.location || '—');
      const openedFmt   = new Date(s.opened_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      const ageHours    = Math.floor((Date.now() - new Date(s.opened_at).getTime()) / (60 * 60 * 1000));
      const floatStr    = `$${(s.opening_float_cents / 100).toFixed(2)}`;
      return `<tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px;color:#1a2e5a;font-weight:700;">${cashierName}</td>
        <td style="padding:8px 10px;color:#475569;">${location}</td>
        <td style="padding:8px 10px;color:#475569;">${openedFmt}</td>
        <td style="padding:8px 10px;color:#dc2626;font-weight:700;text-align:right;">${ageHours}h old</td>
        <td style="padding:8px 10px;color:#1a2e5a;text-align:right;">${floatStr}</td>
      </tr>`;
    }).join('');

    const subject = `🟠 ${closedIds.length} cashier shift${closedIds.length === 1 ? '' : 's'} auto-closed — needs reconciliation`;
    const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#e2e8f0;font-family:'DM Sans',system-ui,sans-serif;color:#1a2e5a;">
  <div style="max-width:620px;margin:24px auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 10px 30px -10px rgba(0,0,0,0.12);border-top:6px solid #b45309;">
    <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#b45309;font-weight:900;">🟠 Auto-closed shifts — reconcile</div>
    <h2 style="margin:6px 0 14px;font-size:22px;color:#1a2e5a;">${closedIds.length} shift${closedIds.length === 1 ? '' : 's'} hit the ${SHIFT_MAX_HOURS}h cap</h2>
    <p style="font-size:13px;color:#475569;margin-bottom:14px;">
      These cashiers left their drawers open beyond the ${SHIFT_MAX_HOURS}-hour cap. The system marked them closed (closing_cash_counted_cents = NULL) so dashboards stay current. Count their drawers and reconcile via the <em>Close on behalf</em> action at <a href="https://bscbahamas.com/dashboard/cashiers" style="color:#1a2e5a;font-weight:700;">/dashboard/cashiers</a>.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
      <thead style="background:#f8fafc;">
        <tr>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:1px;">Cashier</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:1px;">Location</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:1px;">Opened</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:1px;">Age</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:1px;">Float</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:18px;">
      This alert was generated automatically by the Phase 2c shift-sweep cron.
    </p>
  </div>
</body></html>`;

    const results = await Promise.allSettled(recipients.map(to => sendEmail({ to, subject, html })));
    emailSent = results.filter(r => r.status === 'fulfilled').length;
  }

  return NextResponse.json({
    ok:                   true,
    auto_closed:          closedIds.length,
    attempted:            sessions.length,
    session_ids:          closedIds,
    email_recipients:     recipients.length,
    email_sent_count:     emailSent,
  });
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  return processAutoClose();
}
