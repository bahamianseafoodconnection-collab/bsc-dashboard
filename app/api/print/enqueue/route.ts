// =====================================================================
// /api/print/enqueue — queue a slip for the Star CloudPRNT printer
//
// POS "Print Receipt" (or invoice / pick-ticket) POSTs here. We verify
// the caller is staff (is_staff reads users — covers cashiers like
// Kerline who live in users, not just profiles), then insert a PENDING
// print_jobs row. The printer picks it up on its next poll of
// /api/cloudprnt and the markup is rendered fresh at fetch time.
//
//   POST { order_id, job_type?='receipt', printer_id?, copies?=1 }
//   →    { ok, job_id, printer_id } | { ok:false, error }
//
// Server-authoritative: the row is written with the service role after
// the staff check, never trusting the client to be allowed.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JOB_TYPES = new Set(['receipt', 'invoice', 'pick_ticket']);

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const authHeader = req.headers.get('authorization') ?? '';
  if (!url || !anon || !svc) return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });

  // Identity + staff check against the caller's own token.
  const uc = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const { data: staff } = await uc.rpc('is_staff');
  if (staff !== true) return NextResponse.json({ ok: false, error: 'Staff only' }, { status: 403 });

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }
  const orderId = typeof body.order_id === 'string' ? body.order_id : null;
  const jobType = JOB_TYPES.has(String(body.job_type)) ? String(body.job_type) : 'receipt';
  const copies = Math.min(5, Math.max(1, Number(body.copies) || 1));
  let printerId = typeof body.printer_id === 'string' ? body.printer_id : null;
  if (!orderId) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 });

  const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });

  // Default to the single active printer (Nassau today; extensible).
  if (!printerId) {
    const { data: printers } = await admin
      .from('printers').select('id').eq('is_active', true).order('created_at', { ascending: true }).limit(1);
    printerId = ((printers ?? [])[0] as { id?: string } | undefined)?.id ?? null;
  }
  if (!printerId) return NextResponse.json({ ok: false, error: 'No active printer registered' }, { status: 409 });

  const { data: job, error } = await admin
    .from('print_jobs')
    .insert({ printer_id: printerId, job_type: jobType, order_id: orderId, copies, status: 'pending' })
    .select('id')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, job_id: (job as { id: string }).id, printer_id: printerId });
}
