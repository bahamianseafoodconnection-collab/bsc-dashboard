// /api/cashiers/weekly-digest
//
// Monday morning recap of last calendar week's cashier drawer activity.
// Mirror of /api/ar/aging-alert pattern: GET = Vercel cron (CRON_SECRET),
// POST = admin manual trigger (staff JWT).
//
// Pulls from the cash_drawer_session_totals view, groups by cashier,
// computes the same numbers /dashboard/cashiers/trends shows. Emails
// branded HTML table + attaches a CSV so the founder can spreadsheet it.
//
// Recipients env cascade:
//   CASHIER_VARIANCE_ALERT_EMAILS
//   → AR_AGING_ALERT_EMAILS
// Unset = silent no-op.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);
const SHORT_THRESHOLD_CENTS = -500;  // -$5
const OVER_THRESHOLD_CENTS  = 2000;  // +$20

interface SessionTotalsRow {
  session_id:                  string;
  cashier_user_id:             string;
  location:                    string;
  status:                      'open' | 'closed';
  opened_at:                   string;
  closed_at:                   string | null;
  opening_float_cents:         number;
  closing_cash_counted_cents:  number | null;
  variance_cents:              number | null;
  cash_sales_cents:            number;
  card_sales_cents:            number;
  wire_sales_cents:            number;
  account_sales_cents:         number;
  total_sales_cents:           number;
  order_count:                 number;
}

interface ProfileMini { id: string; full_name: string | null; role: string | null; }

interface CashierAgg {
  cashier_user_id:      string;
  full_name:            string;
  role:                 string;
  locations:            string[];
  sessions:             number;
  total_sales_cents:    number;
  cash_sales_cents:     number;
  card_sales_cents:     number;
  wire_sales_cents:     number;
  account_sales_cents:  number;
  total_variance_cents: number;
  short_count:          number;
  over_count:           number;
  worst_short_cents:    number;
  best_over_cents:      number;
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

// Returns [start, end] for the previous full Mon-Sun calendar week.
function previousWeekRange(): { from: string; to: string } {
  const now = new Date();
  // Find last Sunday (end of the previous week)
  const day = now.getUTCDay(); // 0=Sun..6=Sat
  // Days back to most-recent Sunday at 23:59:59 UTC
  const daysBackToSun = day === 0 ? 7 : day;
  const sun = new Date(now);
  sun.setUTCDate(now.getUTCDate() - daysBackToSun);
  // The previous Monday is 6 days before that Sunday
  const mon = new Date(sun);
  mon.setUTCDate(sun.getUTCDate() - 6);
  return { from: isoDate(mon), to: isoDate(sun) };
}

function dollars(cents: number): string {
  const n = cents / 100;
  return n < 0 ? `−$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

function csvCell(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function buildDigest(admin: SupabaseClient) {
  const { from, to } = previousWeekRange();

  const { data: rows } = await admin
    .from('cash_drawer_session_totals')
    .select('*')
    .eq('status', 'closed')
    .gte('closed_at', `${from}T00:00:00`)
    .lte('closed_at', `${to}T23:59:59`)
    .order('closed_at', { ascending: false });
  const sessions = (rows ?? []) as SessionTotalsRow[];

  const uids = Array.from(new Set(sessions.map(s => s.cashier_user_id).filter(Boolean)));
  const profMap: Record<string, ProfileMini> = {};
  if (uids.length > 0) {
    const { data: profs } = await admin.from('profiles').select('id, full_name, role').in('id', uids);
    for (const p of (profs ?? []) as ProfileMini[]) profMap[p.id] = p;
  }

  const map = new Map<string, CashierAgg>();
  for (const s of sessions) {
    const variance = s.variance_cents ?? 0;
    const existing = map.get(s.cashier_user_id);
    const prof = profMap[s.cashier_user_id];
    const row: CashierAgg = existing ?? {
      cashier_user_id:      s.cashier_user_id,
      full_name:            prof?.full_name ?? '(unknown)',
      role:                 prof?.role ?? '—',
      locations:            [],
      sessions:             0,
      total_sales_cents:    0,
      cash_sales_cents:     0,
      card_sales_cents:     0,
      wire_sales_cents:     0,
      account_sales_cents:  0,
      total_variance_cents: 0,
      short_count:          0,
      over_count:           0,
      worst_short_cents:    0,
      best_over_cents:      0,
    };
    row.sessions             += 1;
    row.total_sales_cents    += s.total_sales_cents;
    row.cash_sales_cents     += s.cash_sales_cents;
    row.card_sales_cents     += s.card_sales_cents;
    row.wire_sales_cents     += s.wire_sales_cents;
    row.account_sales_cents  += s.account_sales_cents;
    row.total_variance_cents += variance;
    if (variance < SHORT_THRESHOLD_CENTS) row.short_count += 1;
    if (variance > OVER_THRESHOLD_CENTS)  row.over_count  += 1;
    if (variance < row.worst_short_cents) row.worst_short_cents = variance;
    if (variance > row.best_over_cents)   row.best_over_cents   = variance;
    if (!row.locations.includes(s.location)) row.locations.push(s.location);
    map.set(s.cashier_user_id, row);
  }
  const trends = Array.from(map.values()).sort((a, b) => b.total_sales_cents - a.total_sales_cents);

  const totals = trends.reduce((acc, t) => ({
    sessions: acc.sessions + t.sessions,
    total:    acc.total    + t.total_sales_cents,
    cash:     acc.cash     + t.cash_sales_cents,
    card:     acc.card     + t.card_sales_cents,
    wire:     acc.wire     + t.wire_sales_cents,
    account:  acc.account  + t.account_sales_cents,
    variance: acc.variance + t.total_variance_cents,
    short:    acc.short    + t.short_count,
    over:     acc.over     + t.over_count,
  }), { sessions: 0, total: 0, cash: 0, card: 0, wire: 0, account: 0, variance: 0, short: 0, over: 0 });

  return { from, to, trends, totals, sessionCount: sessions.length };
}

function renderHtml(d: Awaited<ReturnType<typeof buildDigest>>): string {
  const rows = d.trends.map(t => {
    const avg = t.sessions > 0 ? Math.round(t.total_variance_cents / t.sessions) : 0;
    return `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:8px 10px;font-size:12px;color:#1a2e5a;">
        <strong>${t.full_name}</strong><br/>
        <span style="color:#475569;font-size:10px;">${t.role} · ${t.locations.join(' + ')}</span>
      </td>
      <td style="padding:8px 10px;text-align:right;font-size:12px;color:#475569;">${t.sessions}</td>
      <td style="padding:8px 10px;text-align:right;font-size:12px;color:#1a2e5a;font-weight:800;">${dollars(t.total_sales_cents)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:11px;color:#475569;">${dollars(t.cash_sales_cents)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:11px;color:#475569;">${dollars(t.card_sales_cents)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:11px;color:#475569;">${dollars(t.account_sales_cents)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:12px;font-weight:700;color:${t.total_variance_cents < 0 ? '#9b1c1c' : t.total_variance_cents > 0 ? '#b45309' : '#0a6b2f'};">${dollars(t.total_variance_cents)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:11px;color:${avg < 0 ? '#9b1c1c' : avg > 0 ? '#b45309' : '#0a6b2f'};">${dollars(avg)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:12px;color:${t.short_count > 0 ? '#9b1c1c' : '#94a3b8'};font-weight:${t.short_count > 0 ? '700' : '400'};">${t.short_count}</td>
      <td style="padding:8px 10px;text-align:right;font-size:11px;color:${t.worst_short_cents < 0 ? '#9b1c1c' : '#94a3b8'};">${t.worst_short_cents < 0 ? dollars(t.worst_short_cents) : '—'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#e2e8f0;font-family:'DM Sans',system-ui,sans-serif;color:#1a2e5a;">
  <div style="max-width:880px;margin:24px auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 10px 30px -10px rgba(0,0,0,0.12);border-top:6px solid #f5c518;">
    <div style="text-align:center;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:18px;">
      <img src="https://bscbahamas.com/brand/bsc-marketplace-logo.png" alt="BSC Market Place" style="height:90px;width:auto;display:block;margin:0 auto;" />
      <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;color:#a16207;text-transform:uppercase;margin-top:6px;">Weekly cashier digest</div>
    </div>

    <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#f5c518;font-weight:900;">📈 Last week — closed shifts only</div>
    <h2 style="margin:6px 0 4px;font-size:22px;color:#1a2e5a;">${d.from} → ${d.to}</h2>
    <p style="font-size:13px;color:#475569;margin:0 0 18px;">
      ${d.trends.length} cashier${d.trends.length === 1 ? '' : 's'} · ${d.sessionCount} closed session${d.sessionCount === 1 ? '' : 's'} · <strong>${dollars(d.totals.total)}</strong> total sales · ${d.totals.short} short shift${d.totals.short === 1 ? '' : 's'} · ${d.totals.over} over · net variance <strong style="color:${d.totals.variance < 0 ? '#9b1c1c' : '#0a6b2f'};">${dollars(d.totals.variance)}</strong>.
    </p>

    ${d.trends.length === 0 ? `
      <div style="background:#fff8e1;border:1px solid #fbbf24;color:#7a5c00;padding:14px;border-radius:8px;font-size:14px;">
        No closed shifts in this window. CSV attached anyway (empty).
      </div>
    ` : `
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:12px;">
        <thead><tr style="background:#f1f5f9;text-align:left;">
          <th style="padding:8px 10px;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Cashier</th>
          <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;">Sessions</th>
          <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;">Total sales</th>
          <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;">Cash</th>
          <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;">Card</th>
          <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;">Account</th>
          <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;">Sum variance</th>
          <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;">Avg / shift</th>
          <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;">Short</th>
          <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;">Worst</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <p style="font-size:11px;color:#94a3b8;margin-top:10px;">
        Short = variance &lt; −$5 · Over = variance &gt; +$20 · Same thresholds the live alert email uses.<br/>
        Full CSV attached. View the live dashboard at <a href="https://bscbahamas.com/dashboard/cashiers/trends" style="color:#1a2e5a;">/dashboard/cashiers/trends</a>.
      </p>
    `}

    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:18px;">
      BSC weekly cashier digest · ${new Date().toLocaleString()}
    </p>
  </div>
</body></html>`;
}

function buildCsv(d: Awaited<ReturnType<typeof buildDigest>>): string {
  const headers = ['Cashier','Role','Locations','Sessions','Total sales','Cash','Card','Wire','Account','Sum variance','Avg variance','Short shifts (>$5 short)','Over shifts (>$20 over)','Worst short','Best over'];
  const lines = [
    `# BSC Cashier weekly digest · ${d.from} → ${d.to}`,
    headers.map(csvCell).join(','),
    ...d.trends.map(t => {
      const avg = t.sessions > 0 ? Math.round(t.total_variance_cents / t.sessions) : 0;
      return [
        t.full_name, t.role, t.locations.join('+'), t.sessions,
        (t.total_sales_cents/100).toFixed(2),
        (t.cash_sales_cents/100).toFixed(2),
        (t.card_sales_cents/100).toFixed(2),
        (t.wire_sales_cents/100).toFixed(2),
        (t.account_sales_cents/100).toFixed(2),
        (t.total_variance_cents/100).toFixed(2),
        (avg/100).toFixed(2),
        t.short_count, t.over_count,
        (t.worst_short_cents/100).toFixed(2),
        (t.best_over_cents/100).toFixed(2),
      ].map(csvCell).join(',');
    }),
  ];
  return lines.join('\n');
}

async function handle(req: NextRequest, viaCron: boolean) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 });
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let dryRun = false;

  if (viaCron) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.get('authorization') ?? '';
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ ok: false, error: 'invalid cron secret' }, { status: 401 });
      }
    }
    const url = new URL(req.url);
    if (url.searchParams.get('dry_run') === 'true') dryRun = true;
  } else {
    const tokenHeader = req.headers.get('authorization') ?? '';
    const token       = tokenHeader.startsWith('Bearer ') ? tokenHeader.slice(7) : null;
    if (!token) return NextResponse.json({ ok: false, error: 'missing bearer token' }, { status: 401 });
    const { data: { user }, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !user) return NextResponse.json({ ok: false, error: 'invalid token' }, { status: 401 });
    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!callerProfile || !STAFF_ROLES.has(callerProfile.role as string)) {
      return NextResponse.json({ ok: false, error: 'staff role required' }, { status: 403 });
    }
    try {
      const body = await req.json();
      if (body?.dry_run === true) dryRun = true;
    } catch { /* empty body ok */ }
  }

  const digest = await buildDigest(admin);
  const csv = buildCsv(digest);

  const list = (process.env.CASHIER_VARIANCE_ALERT_EMAILS
              ?? process.env.AR_AGING_ALERT_EMAILS
              ?? '')
    .split(',').map(s => s.trim()).filter(Boolean);

  if (list.length === 0) {
    return NextResponse.json({
      ok: true, alerted: false, reason: 'no recipients configured (CASHIER_VARIANCE_ALERT_EMAILS empty)',
      week: { from: digest.from, to: digest.to },
      stats: { cashiers: digest.trends.length, sessions: digest.sessionCount, total_sales_cents: digest.totals.total, net_variance_cents: digest.totals.variance, short_shifts: digest.totals.short, over_shifts: digest.totals.over },
    });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true, alerted: false, reason: 'dry_run',
      week: { from: digest.from, to: digest.to },
      stats: { cashiers: digest.trends.length, sessions: digest.sessionCount, total_sales_cents: digest.totals.total, net_variance_cents: digest.totals.variance, short_shifts: digest.totals.short, over_shifts: digest.totals.over },
      would_send_to: list,
    });
  }

  const subject = `📈 BSC cashier weekly digest · ${digest.from} → ${digest.to} · ${digest.trends.length} cashier${digest.trends.length === 1 ? '' : 's'} · ${dollars(digest.totals.total)}`;
  const html = renderHtml(digest);
  const csvB64 = Buffer.from(csv, 'utf-8').toString('base64');

  const results = await Promise.allSettled(list.map(to => sendEmail({
    to, subject, html,
    attachments: [{
      filename: `bsc-cashier-weekly-${digest.from}-to-${digest.to}.csv`,
      content:  csvB64,
      content_type: 'text/csv',
    }],
  })));
  const sent = results.filter(r => r.status === 'fulfilled').length;

  return NextResponse.json({
    ok: true, alerted: true,
    week: { from: digest.from, to: digest.to },
    stats: { cashiers: digest.trends.length, sessions: digest.sessionCount, total_sales_cents: digest.totals.total, net_variance_cents: digest.totals.variance, short_shifts: digest.totals.short, over_shifts: digest.totals.over },
    recipients_attempted: list.length, recipients_sent: sent,
  });
}

export async function GET(req: NextRequest)  { return handle(req, true); }
export async function POST(req: NextRequest) { return handle(req, false); }
