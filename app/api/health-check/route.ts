// /api/health-check
//
// Two paths:
//   GET  — Vercel cron daily at 6am AST. Requires CRON_SECRET in Authorization.
//          Runs the anomaly scanner; if ANY critical findings, sends a digest
//          email. Warning/info-only days stay silent (no inbox noise).
//   POST — Admin manual trigger. Requires staff JWT. Always returns the full
//          report JSON (UI uses this). Optional ?send_email=true to also
//          email regardless of severity.
//
// Recipients env cascade (same as variance alerts):
//   CASHIER_VARIANCE_ALERT_EMAILS → AR_AGING_ALERT_EMAILS → silent.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { healthCheck, type HealthReport, type HealthFinding, type Severity } from '@/lib/health-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);

function sevColor(s: Severity): string {
  return s === 'critical' ? '#9b1c1c' : s === 'warning' ? '#b45309' : '#0a6b2f';
}
function sevBg(s: Severity): string {
  return s === 'critical' ? '#fde8e8' : s === 'warning' ? '#fef3c7' : '#dcfce7';
}

function renderHtml(report: HealthReport): string {
  const groups: Record<string, HealthFinding[]> = {};
  for (const f of report.findings) {
    (groups[f.category] ??= []).push(f);
  }
  const sections = Object.entries(groups).map(([cat, items]) => {
    const rows = items
      .sort((a, b) => {
        const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      })
      .map(f => `
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:10px 12px;vertical-align:top;width:90px;">
            <span style="display:inline-block;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:900;letter-spacing:0.5px;text-transform:uppercase;background:${sevBg(f.severity)};color:${sevColor(f.severity)};">${f.severity}</span>
          </td>
          <td style="padding:10px 12px;font-size:13px;color:#1a2e5a;line-height:1.5;">
            ${f.message}
            ${f.sample_ids && f.sample_ids.length > 0 ? `<div style="font-size:10px;color:#94a3b8;margin-top:4px;font-family:'Courier New',monospace;">Sample IDs: ${f.sample_ids.map(id => id.slice(0, 8)).join(', ')}</div>` : ''}
          </td>
        </tr>`).join('');
    return `
      <h3 style="margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#475569;">${cat} (${items.length})</h3>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
        <tbody>${rows}</tbody>
      </table>`;
  }).join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#e2e8f0;font-family:'DM Sans',system-ui,sans-serif;color:#1a2e5a;">
  <div style="max-width:780px;margin:24px auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 10px 30px -10px rgba(0,0,0,0.12);border-top:6px solid ${report.by_severity.critical > 0 ? '#9b1c1c' : '#f5c518'};">
    <div style="text-align:center;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:18px;">
      <img src="https://bscbahamas.com/brand/bsc-marketplace-logo.png" alt="BSC Market Place" style="height:90px;width:auto;display:block;margin:0 auto;" />
      <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;color:#a16207;text-transform:uppercase;margin-top:6px;">Operational health digest</div>
    </div>

    <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${report.by_severity.critical > 0 ? '#9b1c1c' : '#f5c518'};font-weight:900;">
      ${report.by_severity.critical > 0 ? '⚠ Critical findings detected' : '✓ Routine scan'}
    </div>
    <h2 style="margin:6px 0 4px;font-size:22px;color:#1a2e5a;">${report.summary}</h2>
    <p style="font-size:13px;color:#475569;margin:0 0 12px;">
      Generated ${new Date(report.generated_at).toLocaleString()} · ${report.total} finding${report.total === 1 ? '' : 's'} across schema / margin / operational categories.
    </p>

    ${report.findings.length === 0
      ? '<div style="padding:24px;text-align:center;background:#dcfce7;color:#065f46;border-radius:8px;font-weight:700;">All clear. No anomalies detected this scan.</div>'
      : sections}

    <p style="font-size:11px;color:#94a3b8;margin-top:18px;">
      View the live dashboard at <a href="https://bscbahamas.com/dashboard/health" style="color:#1a2e5a;">/dashboard/health</a>.
      Critical = money/data risk · Warning = action soon · Info = FYI.
    </p>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:18px;">
      BSC operational health digest · ${new Date().toLocaleString()}
    </p>
  </div>
</body></html>`;
}

async function emailReport(report: HealthReport): Promise<{ sent: number; attempted: number; reason?: string }> {
  const list = (process.env.CASHIER_VARIANCE_ALERT_EMAILS
              ?? process.env.AR_AGING_ALERT_EMAILS
              ?? '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (list.length === 0) return { sent: 0, attempted: 0, reason: 'no recipients configured' };

  const subject = report.by_severity.critical > 0
    ? `⚠ BSC health: ${report.by_severity.critical} critical · ${report.summary}`
    : `BSC health digest · ${report.summary}`;
  const html = renderHtml(report);

  const results = await Promise.allSettled(list.map(to => sendEmail({ to, subject, html })));
  return { sent: results.filter(r => r.status === 'fulfilled').length, attempted: list.length };
}

async function handle(req: NextRequest, viaCron: boolean) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 });
  const admin: SupabaseClient = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let forceEmail = false;

  if (viaCron) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.get('authorization') ?? '';
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ ok: false, error: 'invalid cron secret' }, { status: 401 });
      }
    }
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
    const url = new URL(req.url);
    if (url.searchParams.get('send_email') === 'true') forceEmail = true;
  }

  const report = await healthCheck(admin);

  // Cron path: only email when there's something critical to act on.
  // POST path: always return JSON; email only if send_email=true requested.
  let mail: { sent: number; attempted: number; reason?: string } = { sent: 0, attempted: 0 };
  if (viaCron && report.by_severity.critical > 0) {
    mail = await emailReport(report);
  } else if (!viaCron && forceEmail) {
    mail = await emailReport(report);
  }

  return NextResponse.json({
    ok: true,
    report,
    email: { sent: mail.sent, attempted: mail.attempted, reason: mail.reason },
  });
}

export async function GET(req: NextRequest)  { return handle(req, true); }
export async function POST(req: NextRequest) { return handle(req, false); }
