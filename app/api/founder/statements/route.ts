// =====================================================================
// /api/founder/statements
//
// Founder approval queue for customer statements. Founder-gated
// (get_my_role ∈ founder / co_founder). No statement is EVER sent
// without an explicit approve → send by the founder.
//
//   GET  ?status=pending|approved|sent|all   → list + signed PDF URLs
//   POST { action:'approve', id }            → pending → approved
//   POST { action:'send', id, channel }      → approved → sent (email/whatsapp/print)
//   POST { action:'regenerate', customer_id }→ rebuild this customer's statement now
//   POST { action:'void', id }               → void a statement
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { sendWhatsAppOrSMS } from '@/lib/twilio';
import { runStatementGeneration } from '@/lib/statements/generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOUNDER = new Set(['founder', 'co_founder']);

function env() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    svc: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  };
}

async function gate(req: NextRequest): Promise<{ admin: SupabaseClient; userId: string } | { error: string; status: number }> {
  const { url, anon, svc } = env();
  const authHeader = req.headers.get('authorization') ?? '';
  if (!url || !anon || !svc) return { error: 'Server not configured', status: 500 };
  if (!authHeader.startsWith('Bearer ')) return { error: 'Sign in required', status: 401 };
  const uc = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return { error: 'Sign in required', status: 401 };
  const { data: role } = await uc.rpc('get_my_role');
  if (!FOUNDER.has(String(role))) return { error: 'Founder only', status: 403 };
  const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });
  return { admin, userId: user.id };
}

async function signed(admin: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await admin.storage.from('statements').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const status = req.nextUrl.searchParams.get('status') || 'pending';

  let q = g.admin.from('credit_statements')
    .select('id, customer_id, statement_date, period_start, period_end, status, trigger_reason, pdf_path, total_invoiced, total_paid, total_outstanding, account_status, customer_snapshot, approved_at, sent_at, sent_channel, created_at')
    .order('created_at', { ascending: false }).limit(200);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = await Promise.all((data ?? []).map(async (r) => ({ ...r, pdf_url: await signed(g.admin, (r as { pdf_path: string | null }).pdf_path) })));
  return NextResponse.json({ ok: true, statements: rows });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { admin, userId } = g;

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }
  const action = String(body.action || '');
  const id = typeof body.id === 'string' ? body.id : null;

  if (action === 'regenerate') {
    const customerId = typeof body.customer_id === 'string' ? body.customer_id : null;
    if (!customerId) return NextResponse.json({ ok: false, error: 'customer_id required' }, { status: 400 });
    const { results } = await runStatementGeneration(admin, { force: true, onlyCustomerId: customerId });
    return NextResponse.json({ ok: true, results });
  }

  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

  if (action === 'approve') {
    const { error } = await admin.from('credit_statements')
      .update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'pending');
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'void') {
    const { error } = await admin.from('credit_statements').update({ status: 'void' }).eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'send') {
    const channel = String(body.channel || '');
    if (!['email', 'whatsapp', 'print'].includes(channel)) return NextResponse.json({ ok: false, error: 'bad channel' }, { status: 400 });

    const { data: st } = await admin.from('credit_statements')
      .select('id, status, pdf_path, period_end, total_outstanding, customer_snapshot').eq('id', id).maybeSingle();
    if (!st) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
    const s = st as { status: string; pdf_path: string | null; period_end: string; total_outstanding: number; customer_snapshot: { full_name?: string; phone?: string; email?: string } | null };
    if (s.status !== 'approved' && s.status !== 'sent') return NextResponse.json({ ok: false, error: 'Approve before sending' }, { status: 409 });

    const snap = s.customer_snapshot ?? {};
    const link = await signed(admin, s.pdf_path);

    if (channel === 'print') {
      // Founder prints from the browser; we just record the action.
      await admin.from('credit_statements').update({ sent_at: new Date().toISOString(), sent_channel: 'print', status: 'sent' }).eq('id', id);
      return NextResponse.json({ ok: true, print_url: link });
    }

    if (channel === 'email') {
      if (!snap.email) return NextResponse.json({ ok: false, error: 'No email on file' }, { status: 422 });
      let attachment;
      if (s.pdf_path) {
        const dl = await admin.storage.from('statements').download(s.pdf_path);
        if (dl.data) {
          const b64 = Buffer.from(await dl.data.arrayBuffer()).toString('base64');
          attachment = [{ filename: `BSC-Statement-${s.period_end}.pdf`, content: b64, content_type: 'application/pdf' }];
        }
      }
      const html = `<p>Dear ${snap.full_name || 'Customer'},</p>
        <p>Please find your BSC account statement attached. Current outstanding balance: <strong>$${Number(s.total_outstanding ?? 0).toFixed(2)}</strong>.</p>
        <p>Payments apply to the oldest unpaid invoice first. Banking details are on the statement.</p>
        <p>Questions? WhatsApp / call 242-361-3474.<br/>Bahamian Seafood Connection · bscbahamas.com</p>`;
      const r = await sendEmail({ to: snap.email, subject: `BSC Account Statement — ${s.period_end}`, html, attachments: attachment });
      if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
      await admin.from('credit_statements').update({ sent_at: new Date().toISOString(), sent_channel: 'email', status: 'sent' }).eq('id', id);
      return NextResponse.json({ ok: true });
    }

    // whatsapp
    if (!snap.phone) return NextResponse.json({ ok: false, error: 'No phone on file' }, { status: 422 });
    const msg = `BSC account statement (${s.period_end}). Outstanding balance: $${Number(s.total_outstanding ?? 0).toFixed(2)}.`
      + (link ? `\nView/download: ${link}` : '')
      + `\nQuestions? Call 242-361-3474.`;
    const r = await sendWhatsAppOrSMS({ to: snap.phone, body: msg });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error || 'send failed' }, { status: 502 });
    await admin.from('credit_statements').update({ sent_at: new Date().toISOString(), sent_channel: r.channel || 'whatsapp', status: 'sent' }).eq('id', id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
