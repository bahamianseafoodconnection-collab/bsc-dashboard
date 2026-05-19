// /api/ar/aging-alert
//
// Two paths:
//   GET  — Vercel cron daily. Requires CRON_SECRET in Authorization header.
//   POST — Admin manual trigger. Requires staff JWT.
//
// Both paths do the same work: scan ar_unpaid_orders, group by customer,
// surface every customer whose OLDEST unpaid invoice has aged past the
// threshold (default 60 days), and send a digest email to admins.
//
// Recipients via env AR_AGING_ALERT_EMAILS (comma-separated). Unset = silent
// no-op so the cron never fails publicly. Threshold via query/body
// `threshold_days` (default 60). `dry_run=true` skips the send.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);
const DEFAULT_THRESHOLD_DAYS = 60;

interface UnpaidRow {
  id:             string;
  created_at:     string;
  total:          number;
  customer_id:    string | null;
  customer_name:  string | null;
  customer_phone: string | null;
  age_days:       number;
  bucket:         string;
}

interface CustomerAgg {
  customer_id:    string | null;
  customer_name:  string;
  customer_phone: string | null;
  customer_email: string | null;
  oldest_age:     number;
  total:          number;
  bucket_31_60:   number;
  bucket_61_90:   number;
  bucket_90:      number;
  count:          number;
}

function dollars(n: number): string { return `$${n.toFixed(2)}`; }

async function buildDigest(admin: SupabaseClient, thresholdDays: number) {
  const { data } = await admin
    .from('ar_unpaid_orders')
    .select('id, created_at, total, customer_id, customer_name, customer_phone, age_days, bucket')
    .order('age_days', { ascending: false });
  const rows = (data ?? []) as UnpaidRow[];

  const map = new Map<string, CustomerAgg>();
  for (const r of rows) {
    const key = r.customer_id ?? `phone:${r.customer_phone ?? 'unknown'}::${r.customer_name ?? 'unknown'}`;
    const existing = map.get(key);
    const row: CustomerAgg = existing ?? {
      customer_id:    r.customer_id,
      customer_name:  r.customer_name ?? '(unbound)',
      customer_phone: r.customer_phone,
      customer_email: null,
      oldest_age:     0,
      total:          0,
      bucket_31_60:   0,
      bucket_61_90:   0,
      bucket_90:      0,
      count:          0,
    };
    row.total += Number(r.total);
    row.count += 1;
    if (r.age_days > row.oldest_age) row.oldest_age = r.age_days;
    if (r.bucket === '31-60') row.bucket_31_60 += Number(r.total);
    if (r.bucket === '61-90') row.bucket_61_90 += Number(r.total);
    if (r.bucket === '90+')   row.bucket_90    += Number(r.total);
    map.set(key, row);
  }

  // Side-fetch emails so the digest can mention which customers have email on file
  // (so admin knows who they could send a reminder to).
  const ids = Array.from(map.values()).map(c => c.customer_id).filter((x): x is string => !!x);
  if (ids.length > 0) {
    const { data: cs } = await admin.from('customers').select('id, email').in('id', ids);
    const emailMap: Record<string, string | null> = {};
    for (const c of (cs ?? []) as { id: string; email: string | null }[]) emailMap[c.id] = c.email;
    for (const agg of map.values()) {
      if (agg.customer_id) agg.customer_email = emailMap[agg.customer_id] ?? null;
    }
  }

  // Only customers crossing threshold.
  const stale = Array.from(map.values())
    .filter(c => c.oldest_age >= thresholdDays)
    .sort((a, b) => b.total - a.total);

  const totalOverdue = stale.reduce((s, c) => s + c.total, 0);

  return { stale, totalOverdue, allCount: map.size };
}

function renderEmail(stale: CustomerAgg[], totalOverdue: number, thresholdDays: number): string {
  const rows = stale.map(c => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 8px 10px; font-size: 13px;">
        <strong style="color: #1a2e5a;">${c.customer_name}</strong>${c.customer_phone ? `<br/><span style="font-size: 11px; color: #475569;">${c.customer_phone}</span>` : ''}
        ${c.customer_email ? `<br/><span style="font-size: 11px; color: #4ade80;">📧 ${c.customer_email}</span>` : `<br/><span style="font-size: 11px; color: #9b1c1c;">no email on file</span>`}
      </td>
      <td style="padding: 8px 10px; text-align: right; font-size: 12px; color: #475569;">${c.count}</td>
      <td style="padding: 8px 10px; text-align: right; font-size: 13px; color: #b45309;">${c.bucket_31_60 > 0 ? dollars(c.bucket_31_60) : '—'}</td>
      <td style="padding: 8px 10px; text-align: right; font-size: 13px; color: #c2410c;">${c.bucket_61_90 > 0 ? dollars(c.bucket_61_90) : '—'}</td>
      <td style="padding: 8px 10px; text-align: right; font-size: 13px; color: #9b1c1c; font-weight: 800;">${c.bucket_90 > 0 ? dollars(c.bucket_90) : '—'}</td>
      <td style="padding: 8px 10px; text-align: right; font-size: 14px; color: #1a2e5a; font-weight: 800;">${dollars(c.total)}</td>
      <td style="padding: 8px 10px; text-align: right; font-size: 12px; color: ${c.oldest_age > 90 ? '#9b1c1c' : c.oldest_age > 60 ? '#c2410c' : '#b45309'}; font-weight: 700;">${c.oldest_age}d</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#e2e8f0;font-family:'DM Sans',system-ui,sans-serif;color:#1a2e5a;">
  <div style="max-width:760px;margin:24px auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 10px 30px -10px rgba(0,0,0,0.12);border-top:6px solid #9b1c1c;">
    <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#9b1c1c;font-weight:900;">🔔 AR aging alert</div>
    <h2 style="margin:6px 0 14px;font-size:22px;color:#1a2e5a;">
      ${stale.length} customer${stale.length === 1 ? '' : 's'} past ${thresholdDays}-day threshold
    </h2>
    <p style="font-size:14px;color:#475569;margin:0 0 16px;">
      Total outstanding from these accounts: <strong style="color:#1a2e5a;font-size:18px;">${dollars(totalOverdue)}</strong>.
      Sorted by amount owed.
    </p>

    <table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
      <thead><tr style="background:#f1f5f9;text-align:left;">
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Customer</th>
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;text-transform:uppercase;">Inv</th>
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;text-transform:uppercase;">31-60</th>
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;text-transform:uppercase;">61-90</th>
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;text-transform:uppercase;">90+</th>
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;text-transform:uppercase;">Total</th>
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;text-transform:uppercase;">Oldest</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="background:#fffbeb;border:1px solid #f5c518;border-radius:8px;padding:12px;margin-top:18px;font-size:13px;color:#1a2e5a;line-height:1.6;">
      <strong>Next step:</strong> open <a href="https://bscbahamas.com/dashboard/ar-aging" style="color:#1a2e5a;">/dashboard/ar-aging</a> to send reminder emails (📧 button on each customer), generate statement PDFs, or record payments.
    </div>

    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:18px;">
      BSC Aging digest · ${new Date().toLocaleString()}
    </p>
  </div>
</body></html>`;
}

async function handle(req: NextRequest, viaCron: boolean) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 });
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let thresholdDays = DEFAULT_THRESHOLD_DAYS;
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
    const t   = url.searchParams.get('threshold_days');
    if (t) thresholdDays = Math.max(1, Number(t) || DEFAULT_THRESHOLD_DAYS);
    if (url.searchParams.get('dry_run') === 'true') dryRun = true;
  } else {
    // POST admin — verify staff role
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
      if (typeof body?.threshold_days === 'number') thresholdDays = Math.max(1, body.threshold_days);
      if (body?.dry_run === true) dryRun = true;
    } catch { /* empty body is fine */ }
  }

  const { stale, totalOverdue, allCount } = await buildDigest(admin, thresholdDays);

  if (stale.length === 0) {
    return NextResponse.json({
      ok: true, alerted: false, reason: 'no customers past threshold',
      threshold_days: thresholdDays, total_customers_with_balance: allCount,
    });
  }

  const list = (process.env.AR_AGING_ALERT_EMAILS ?? process.env.CASHIER_VARIANCE_ALERT_EMAILS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (list.length === 0) {
    return NextResponse.json({
      ok: true, alerted: false, reason: 'no recipients configured (AR_AGING_ALERT_EMAILS empty)',
      threshold_days: thresholdDays, stale_customers: stale.length, total_overdue: totalOverdue,
    });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true, alerted: false, reason: 'dry_run',
      threshold_days: thresholdDays, stale_customers: stale.length, total_overdue: totalOverdue,
      would_send_to: list,
    });
  }

  const subject = `🔔 ${stale.length} wholesale account${stale.length === 1 ? '' : 's'} past ${thresholdDays} days — ${dollars(totalOverdue)} overdue`;
  const html    = renderEmail(stale, totalOverdue, thresholdDays);
  const results = await Promise.allSettled(list.map(to => sendEmail({ to, subject, html })));
  const sent    = results.filter(r => r.status === 'fulfilled').length;

  return NextResponse.json({
    ok: true, alerted: true,
    threshold_days: thresholdDays,
    stale_customers: stale.length,
    total_overdue: totalOverdue,
    recipients_attempted: list.length,
    recipients_sent: sent,
  });
}

export async function GET(req: NextRequest)  { return handle(req, true); }
export async function POST(req: NextRequest) { return handle(req, false); }
