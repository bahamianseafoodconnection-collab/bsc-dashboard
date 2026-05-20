// /api/spinytails/ssop-reminder
//
// Two paths (mirror of /api/ar/aging-alert):
//   GET  — Vercel cron daily. CRON_SECRET in Authorization header.
//   POST — Admin manual trigger. Staff JWT required.
//
// Both produce one branded HTML digest covering four sections:
//   1. Today's required SSOP checks that haven't been logged yet
//      (12 SSOPs × pre_op + post_op = up to 24 slots/day)
//   2. Failed sanitation checks from the past 7 days with no
//      corrective_action_notes
//   3. Equipment calibration due within 14 days (next_due_date <=)
//   4. Staff training expiring within 30 days
//
// Recipients env (with cascading fallback):
//   SPINYTAILS_SSOP_ALERT_EMAILS
//   → AR_AGING_ALERT_EMAILS
//   → CASHIER_VARIANCE_ALERT_EMAILS
// Unset = silent no-op so cron never fails publicly.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);

// The 12 SSOPs we expect daily pre_op + post_op checks for
const SSOP_ENUM = [
  'ssop_01_water','ssop_02_facility_cleanliness','ssop_03_cross_contamination',
  'ssop_04_handwash_toilets','ssop_05_food_protection','ssop_06_toxic_chemicals',
  'ssop_07_employee_health','ssop_08_pest_exclusion','ssop_09_waste_disposal',
  'ssop_10_outside_contractors','ssop_11_transport_vehicles','ssop_12_raw_material_storage',
] as const;

const SSOP_LABELS: Record<string, string> = {
  ssop_01_water: 'SSOP 1 · Water safety',
  ssop_02_facility_cleanliness: 'SSOP 2 · Facility cleanliness',
  ssop_03_cross_contamination: 'SSOP 3 · Cross-contamination',
  ssop_04_handwash_toilets: 'SSOP 4 · Handwash & toilets',
  ssop_05_food_protection: 'SSOP 5 · Food protection',
  ssop_06_toxic_chemicals: 'SSOP 6 · Toxic chemicals',
  ssop_07_employee_health: 'SSOP 7 · Employee health',
  ssop_08_pest_exclusion: 'SSOP 8 · Pest exclusion',
  ssop_09_waste_disposal: 'SSOP 9 · Waste disposal',
  ssop_10_outside_contractors: 'SSOP 10 · Outside contractors',
  ssop_11_transport_vehicles: 'SSOP 11 · Transport vehicles',
  ssop_12_raw_material_storage: 'SSOP 12 · Raw material storage',
};

interface SanitationCheckRow { ssop: string; check_phase: 'pre_op' | 'post_op'; compliant: boolean; corrective_action_notes: string | null; check_date: string; check_time: string; }
interface CalibRow { equipment_id: string; equipment_type: string | null; next_due: string; performed_at: string; }
interface TrainingRow { staff_id: string | null; topic: string; expiry_date: string | null; }
interface ProfileMini { id: string; full_name: string | null; }

function isoDate(d = new Date()): string { return d.toISOString().slice(0, 10); }

async function buildDigest(admin: SupabaseClient) {
  const today        = isoDate();
  const sevenDaysAgo = isoDate(new Date(Date.now() - 7  * 86_400_000));
  const in14         = isoDate(new Date(Date.now() + 14 * 86_400_000));
  const in30         = isoDate(new Date(Date.now() + 30 * 86_400_000));

  const [
    { data: todayChecks },
    { data: recentFailures },
    { data: calibsDue },
    { data: trainingExpiring },
  ] = await Promise.all([
    admin.from('spinytails_sanitation_checks').select('ssop, check_phase, compliant, corrective_action_notes, check_date, check_time').eq('check_date', today),
    admin.from('spinytails_sanitation_checks').select('ssop, check_phase, compliant, corrective_action_notes, check_date, check_time').eq('compliant', false).gte('check_date', sevenDaysAgo).order('check_date', { ascending: false }),
    admin.from('spinytails_calibration_logs').select('equipment_id, equipment_type, next_due, performed_at').not('next_due', 'is', null).lte('next_due', in14).order('next_due', { ascending: true }),
    admin.from('spinytails_training_records').select('staff_id, topic, expiry_date').not('expiry_date', 'is', null).lte('expiry_date', in30).order('expiry_date', { ascending: true }),
  ]);

  const todayRows    = (todayChecks    ?? []) as SanitationCheckRow[];
  const failureRows  = (recentFailures ?? []) as SanitationCheckRow[];
  const calibRows    = (calibsDue      ?? []) as CalibRow[];
  const trainingRows = (trainingExpiring ?? []) as TrainingRow[];

  // Compute missing checks for today: 12 SSOPs × 2 phases = 24 expected slots
  const doneSet = new Set(todayRows.map(r => `${r.ssop}::${r.check_phase}`));
  const missing: { ssop: string; phase: 'pre_op' | 'post_op' }[] = [];
  for (const s of SSOP_ENUM) {
    for (const phase of ['pre_op', 'post_op'] as const) {
      if (!doneSet.has(`${s}::${phase}`)) missing.push({ ssop: s, phase });
    }
  }

  // Unresolved failures: failed checks without corrective_action_notes
  const unresolvedFailures = failureRows.filter(r => !r.corrective_action_notes || !r.corrective_action_notes.trim());

  // Resolve staff names for training rows
  const staffIds = Array.from(new Set(trainingRows.map(t => t.staff_id).filter((x): x is string => !!x)));
  const profileMap: Record<string, string> = {};
  if (staffIds.length > 0) {
    const { data: profs } = await admin.from('profiles').select('id, full_name').in('id', staffIds);
    for (const p of (profs ?? []) as ProfileMini[]) profileMap[p.id] = p.full_name ?? '(unknown)';
  }

  return { today, missing, unresolvedFailures, calibRows, trainingRows, profileMap, totalCompletedToday: todayRows.length };
}

function renderEmail(d: Awaited<ReturnType<typeof buildDigest>>): string {
  const sectionsHave = (d.missing.length + d.unresolvedFailures.length + d.calibRows.length + d.trainingRows.length) > 0;

  const missingRows = d.missing.map(m => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:6px 10px;font-size:12px;color:#1a2e5a;">${SSOP_LABELS[m.ssop] ?? m.ssop}</td>
      <td style="padding:6px 10px;font-size:11px;color:${m.phase === 'pre_op' ? '#b45309' : '#475569'};text-transform:uppercase;font-weight:800;">${m.phase.replace('_', ' ')}</td>
    </tr>
  `).join('');

  const failureRows = d.unresolvedFailures.map(f => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:6px 10px;font-size:12px;color:#1a2e5a;">${SSOP_LABELS[f.ssop] ?? f.ssop}</td>
      <td style="padding:6px 10px;font-size:11px;color:#475569;text-transform:uppercase;font-weight:800;">${f.check_phase.replace('_', ' ')}</td>
      <td style="padding:6px 10px;font-size:11px;color:#9b1c1c;font-weight:700;">${f.check_date}</td>
    </tr>
  `).join('');

  const calibRows = d.calibRows.map(c => {
    const dueDate = new Date(c.next_due);
    const days = Math.floor((dueDate.getTime() - Date.now()) / 86_400_000);
    const color = days < 0 ? '#9b1c1c' : days < 7 ? '#b45309' : '#475569';
    return `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:6px 10px;font-size:12px;color:#1a2e5a;font-family:ui-monospace,Menlo,monospace;">${c.equipment_id}</td>
      <td style="padding:6px 10px;font-size:11px;color:#475569;">${c.equipment_type ?? '—'}</td>
      <td style="padding:6px 10px;font-size:11px;color:${color};font-weight:700;">${c.next_due}${days < 0 ? ` (${Math.abs(days)}d overdue)` : ` (in ${days}d)`}</td>
    </tr>`;
  }).join('');

  const trainingRowsHtml = d.trainingRows.map(t => {
    if (!t.expiry_date) return '';
    const expDate = new Date(t.expiry_date);
    const days = Math.floor((expDate.getTime() - Date.now()) / 86_400_000);
    const color = days < 0 ? '#9b1c1c' : days < 7 ? '#b45309' : '#475569';
    const name = t.staff_id ? d.profileMap[t.staff_id] ?? '(unknown staff)' : '(unattributed)';
    return `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:6px 10px;font-size:12px;color:#1a2e5a;">${name}</td>
      <td style="padding:6px 10px;font-size:11px;color:#475569;">${t.topic}</td>
      <td style="padding:6px 10px;font-size:11px;color:${color};font-weight:700;">${t.expiry_date}${days < 0 ? ` (${Math.abs(days)}d expired)` : ` (in ${days}d)`}</td>
    </tr>`;
  }).filter(Boolean).join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#e2e8f0;font-family:'DM Sans',system-ui,sans-serif;color:#1a2e5a;">
  <div style="max-width:760px;margin:24px auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 10px 30px -10px rgba(0,0,0,0.12);border-top:6px solid #f5c518;">
    <div style="text-align:center;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:18px;">
      <img src="https://bscbahamas.com/brand/bsc-marketplace-logo.png" alt="BSC Market Place" style="height:90px;width:auto;display:block;margin:0 auto;" />
      <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;color:#a16207;text-transform:uppercase;margin-top:6px;">Spiny Tails Processing Co.</div>
    </div>

    <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#f5c518;font-weight:900;">🔔 SSOP / HACCP daily digest</div>
    <h2 style="margin:6px 0 14px;font-size:22px;color:#1a2e5a;">
      ${d.today} — ${sectionsHave ? `${d.missing.length} missing / ${d.unresolvedFailures.length} unresolved / ${d.calibRows.length} calibration / ${d.trainingRows.length} training` : '✓ All clear'}
    </h2>

    ${!sectionsHave ? `
      <div style="background:#f0fdf4;border:1px solid #16a34a;color:#166534;padding:14px;border-radius:8px;font-size:14px;">
        ✓ Nothing overdue today. Sanitation checks complete, no unresolved failures, no calibration or training items due in the watch window.
      </div>
    ` : ''}

    ${d.missing.length > 0 ? `
      <h3 style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:22px 0 6px;">
        🧼 Missing today (${d.missing.length} of 24)
      </h3>
      <p style="font-size:11px;color:#475569;margin:0 0 6px;">
        ${d.totalCompletedToday} of 24 expected slots completed. Log the missing checks in /spinytails/lots — sanitation_checks.
      </p>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:12px;">
        <thead><tr style="background:#f1f5f9;text-align:left;"><th style="padding:6px 10px;font-size:10px;color:#475569;text-transform:uppercase;">SSOP</th><th style="padding:6px 10px;font-size:10px;color:#475569;text-transform:uppercase;">Phase</th></tr></thead>
        <tbody>${missingRows}</tbody>
      </table>
    ` : ''}

    ${d.unresolvedFailures.length > 0 ? `
      <h3 style="font-size:11px;color:#9b1c1c;text-transform:uppercase;letter-spacing:1px;margin:22px 0 6px;">
        ⚠ Unresolved failures (${d.unresolvedFailures.length}) — past 7 days
      </h3>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #f87171;border-radius:6px;overflow:hidden;font-size:12px;">
        <thead><tr style="background:#fee2e2;text-align:left;"><th style="padding:6px 10px;font-size:10px;color:#991b1b;text-transform:uppercase;">SSOP</th><th style="padding:6px 10px;font-size:10px;color:#991b1b;text-transform:uppercase;">Phase</th><th style="padding:6px 10px;font-size:10px;color:#991b1b;text-transform:uppercase;">Failed on</th></tr></thead>
        <tbody>${failureRows}</tbody>
      </table>
    ` : ''}

    ${d.calibRows.length > 0 ? `
      <h3 style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:22px 0 6px;">
        ⚙️ Calibration due (${d.calibRows.length}) — within 14 days
      </h3>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:12px;">
        <thead><tr style="background:#f1f5f9;text-align:left;"><th style="padding:6px 10px;font-size:10px;color:#475569;text-transform:uppercase;">Equipment</th><th style="padding:6px 10px;font-size:10px;color:#475569;text-transform:uppercase;">Type</th><th style="padding:6px 10px;font-size:10px;color:#475569;text-transform:uppercase;">Next due</th></tr></thead>
        <tbody>${calibRows}</tbody>
      </table>
    ` : ''}

    ${d.trainingRows.length > 0 ? `
      <h3 style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:22px 0 6px;">
        🎓 Training expiring (${d.trainingRows.length}) — within 30 days
      </h3>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:12px;">
        <thead><tr style="background:#f1f5f9;text-align:left;"><th style="padding:6px 10px;font-size:10px;color:#475569;text-transform:uppercase;">Staff</th><th style="padding:6px 10px;font-size:10px;color:#475569;text-transform:uppercase;">Topic</th><th style="padding:6px 10px;font-size:10px;color:#475569;text-transform:uppercase;">Expires</th></tr></thead>
        <tbody>${trainingRowsHtml}</tbody>
      </table>
    ` : ''}

    <div style="background:#fffbeb;border:1px solid #f5c518;border-radius:8px;padding:12px;margin-top:18px;font-size:13px;color:#1a2e5a;">
      <strong>Next step:</strong> open <a href="https://bscbahamas.com/spinytails" style="color:#1a2e5a;">/spinytails</a>${d.missing.length > 0 ? ' to log today\'s sanitation checks' : ''}${d.unresolvedFailures.length > 0 ? ', address unresolved failures' : ''}${d.calibRows.length > 0 ? ', schedule calibration' : ''}${d.trainingRows.length > 0 ? ', book training renewal' : ''}.
    </div>

    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:18px;">
      BSC Spiny Tails compliance digest · ${new Date().toLocaleString()}
    </p>
  </div>
</body></html>`;
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
    } catch { /* empty body fine */ }
  }

  const digest = await buildDigest(admin);
  const totalFlags = digest.missing.length + digest.unresolvedFailures.length + digest.calibRows.length + digest.trainingRows.length;

  const list = (process.env.SPINYTAILS_SSOP_ALERT_EMAILS
              ?? process.env.AR_AGING_ALERT_EMAILS
              ?? process.env.CASHIER_VARIANCE_ALERT_EMAILS
              ?? '')
    .split(',').map(s => s.trim()).filter(Boolean);

  if (list.length === 0) {
    return NextResponse.json({
      ok: true, alerted: false, reason: 'no recipients configured (SPINYTAILS_SSOP_ALERT_EMAILS empty)',
      stats: { missing: digest.missing.length, unresolved: digest.unresolvedFailures.length, calib_due: digest.calibRows.length, training_expiring: digest.trainingRows.length, total_flags: totalFlags },
    });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true, alerted: false, reason: 'dry_run',
      stats: { missing: digest.missing.length, unresolved: digest.unresolvedFailures.length, calib_due: digest.calibRows.length, training_expiring: digest.trainingRows.length, total_flags: totalFlags },
      would_send_to: list,
    });
  }

  const subject = totalFlags === 0
    ? `✓ Spiny Tails SSOP digest — all clear`
    : `🔔 Spiny Tails SSOP digest — ${digest.missing.length} missing / ${digest.unresolvedFailures.length} unresolved / ${digest.calibRows.length} calib / ${digest.trainingRows.length} training`;
  const html = renderEmail(digest);
  const results = await Promise.allSettled(list.map(to => sendEmail({ to, subject, html })));
  const sent = results.filter(r => r.status === 'fulfilled').length;

  return NextResponse.json({
    ok: true, alerted: true,
    stats: { missing: digest.missing.length, unresolved: digest.unresolvedFailures.length, calib_due: digest.calibRows.length, training_expiring: digest.trainingRows.length, total_flags: totalFlags },
    recipients_attempted: list.length, recipients_sent: sent,
  });
}

export async function GET(req: NextRequest)  { return handle(req, true); }
export async function POST(req: NextRequest) { return handle(req, false); }
