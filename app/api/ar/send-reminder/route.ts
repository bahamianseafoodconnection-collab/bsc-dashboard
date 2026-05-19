// POST /api/ar/send-reminder
//
// Send a wholesale-credit aging reminder email to a customer. Pulls
// every unpaid account order, renders the same aging summary the
// statement PDF shows, and emails it via Resend. Caller must be staff.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);

interface Body {
  customer_id: string;
  cc_self?:    boolean;   // future: cc the admin who triggered
}

interface UnpaidRow {
  id:         string;
  created_at: string;
  total:      number;
  age_days:   number;
  bucket:     string;
}

function dollars(n: number): string { return `$${n.toFixed(2)}`; }
function fmtDate(s: string): string { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 });
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Caller auth — must be staff
  const tokenHeader = req.headers.get('authorization') || '';
  const token       = tokenHeader.startsWith('Bearer ') ? tokenHeader.slice(7) : null;
  if (!token) return NextResponse.json({ ok: false, error: 'missing bearer token' }, { status: 401 });
  const { data: { user }, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'invalid token' }, { status: 401 });
  const { data: callerProfile } = await admin.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
  if (!callerProfile || !STAFF_ROLES.has(callerProfile.role as string)) {
    return NextResponse.json({ ok: false, error: 'staff role required' }, { status: 403 });
  }

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  if (!body.customer_id) return NextResponse.json({ ok: false, error: 'customer_id required' }, { status: 400 });

  // Customer + their unpaid invoices
  const { data: customer } = await admin
    .from('customers')
    .select('id, full_name, email, phone, phone_e164')
    .eq('id', body.customer_id)
    .maybeSingle();
  if (!customer) return NextResponse.json({ ok: false, error: 'customer not found' }, { status: 404 });
  if (!customer.email) return NextResponse.json({ ok: false, error: 'customer has no email on file' }, { status: 400 });

  const { data: orders } = await admin
    .from('ar_unpaid_orders')
    .select('id, created_at, total, age_days, bucket')
    .eq('customer_id', body.customer_id)
    .order('created_at', { ascending: true });
  const rows = (orders ?? []) as UnpaidRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: 'no unpaid invoices for this customer' }, { status: 400 });
  }

  const aging = rows.reduce((acc, o) => {
    const b = o.bucket as '0-30' | '31-60' | '61-90' | '90+';
    acc[b] += Number(o.total);
    acc.total += Number(o.total);
    return acc;
  }, { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 });

  const dueBy = new Date(); dueBy.setDate(dueBy.getDate() + 30);
  const dueByStr = dueBy.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const invoiceRows = rows.map(o => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 8px 10px; font-size: 13px; color: #1a2e5a;">${fmtDate(o.created_at)}</td>
      <td style="padding: 8px 10px; font-family: monospace; font-size: 12px; color: #1a2e5a;">INV-${o.id.slice(0,8).toUpperCase()}</td>
      <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: ${o.age_days > 90 ? '#9b1c1c' : o.age_days > 60 ? '#c2410c' : o.age_days > 30 ? '#b45309' : '#0f7a3f'};">${o.age_days}d</td>
      <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #1a2e5a;">${dollars(Number(o.total))}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#e2e8f0;font-family:'DM Sans',system-ui,sans-serif;color:#1a2e5a;">
  <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 10px 30px -10px rgba(0,0,0,0.12);">
    <div style="text-align:center;border-bottom:2px solid #1a2e5a;padding-bottom:14px;margin-bottom:18px;">
      <div style="font-size:26px;font-weight:900;color:#1a2e5a;letter-spacing:0.5px;">BSC Market Place</div>
      <div style="font-size:12px;color:#475569;margin-top:6px;">Epic Plaza, Fire Trail Rd, Nassau · 242-822-6180 · TIN# 111392634</div>
    </div>

    <div style="background:#1a2e5a;color:#f5c518;padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:16px;font-weight:900;letter-spacing:1px;">
      ACCOUNT REMINDER
    </div>

    <p style="font-size:14px;line-height:1.6;margin:0 0 14px;">
      Hi <strong>${customer.full_name ?? 'customer'}</strong>,
    </p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 14px;">
      We're reaching out as a friendly reminder about your wholesale credit account with Bahamian Seafood Connection. Below is a summary of the outstanding invoices on your account.
    </p>

    <h3 style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:22px 0 8px;">Aging summary</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr style="background:#f1f5f9;"><td style="padding:8px 10px;">Current (0-30 days)</td><td style="padding:8px 10px;text-align:right;color:#0f7a3f;font-weight:600;">${aging['0-30'] > 0 ? dollars(aging['0-30']) : '—'}</td></tr>
      <tr><td style="padding:8px 10px;">31-60 days overdue</td><td style="padding:8px 10px;text-align:right;color:#b45309;font-weight:600;">${aging['31-60'] > 0 ? dollars(aging['31-60']) : '—'}</td></tr>
      <tr style="background:#f1f5f9;"><td style="padding:8px 10px;">61-90 days overdue</td><td style="padding:8px 10px;text-align:right;color:#c2410c;font-weight:600;">${aging['61-90'] > 0 ? dollars(aging['61-90']) : '—'}</td></tr>
      <tr><td style="padding:8px 10px;">Over 90 days overdue</td><td style="padding:8px 10px;text-align:right;color:#9b1c1c;font-weight:800;">${aging['90+'] > 0 ? dollars(aging['90+']) : '—'}</td></tr>
      <tr style="border-top:2px solid #1a2e5a;"><td style="padding:10px;font-weight:900;color:#1a2e5a;">TOTAL DUE</td><td style="padding:10px;text-align:right;font-weight:900;color:#1a2e5a;font-size:18px;">${dollars(aging.total)}</td></tr>
    </table>

    <h3 style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:22px 0 8px;">Unpaid invoices (${rows.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f1f5f9;text-align:left;"><th style="padding:8px 10px;font-size:11px;color:#475569;">Date</th><th style="padding:8px 10px;font-size:11px;color:#475569;">Invoice #</th><th style="padding:8px 10px;text-align:right;font-size:11px;color:#475569;">Age</th><th style="padding:8px 10px;text-align:right;font-size:11px;color:#475569;">Total</th></tr></thead>
      <tbody>${invoiceRows}</tbody>
    </table>

    <div style="background:#fffbeb;border:1px solid #f5c518;border-radius:8px;padding:14px;margin-top:20px;">
      <strong style="color:#92400e;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Payment instructions</strong><br/>
      <span style="font-size:13px;color:#1a2e5a;line-height:1.6;">
        We accept Cash · Card · Wire · Check. Please reference your invoice number(s) when paying. <strong>Due by ${dueByStr}</strong> (30 days).<br/>
        Questions? Reply to this email or call <strong>242-822-6180</strong>.
      </span>
    </div>

    <p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:22px;">
      Thank you for your continued business.<br/>
      Bahamian Seafood Connection · ${new Date().toLocaleDateString()}
    </p>
  </div>
</body></html>`;

  const subject = `BSC Account reminder — balance due ${dollars(aging.total)}`;
  const send = await sendEmail({ to: customer.email, subject, html });
  if (send.error) return NextResponse.json({ ok: false, error: send.error }, { status: 500 });

  // Stamp admin_notes on the most recent unpaid invoice so the trail
  // shows when a reminder went out + who sent it.
  const last = rows[rows.length - 1];
  await admin.from('orders').update({
    admin_notes: `Reminder sent ${new Date().toISOString()} by ${callerProfile.full_name ?? 'admin'} to ${customer.email}`,
  }).eq('id', last.id);

  return NextResponse.json({ ok: true, sent_to: customer.email, resend_id: send.id, invoice_count: rows.length, total_due: aging.total });
}
