// /api/rbc/inbound
//
// AUTOMATIC RBC report ingestion. RBC's daily Merchant POS report (.docx) is
// pushed here every morning — by a Gmail Apps Script (zero DNS, uses the inbox
// that already receives it) or an inbound-email provider on rbc.bscbahamas.com.
// Secured by a shared token (env RBC_INBOUND_TOKEN), NOT a user session.
//
// Accepts either:
//   - application/json  { token?, file_base64, file_name }   (Apps Script)
//   - multipart/form-data with a file field                  (provider webhook)
// Runs the same parser+matcher as the manual route, source='email'.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processRbcReport } from '@/lib/rbc/process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function tokenOk(req: NextRequest, provided: string | null): boolean {
  const expected = process.env.RBC_INBOUND_TOKEN;
  if (!expected) return false;
  const got = provided || req.headers.get('x-rbc-token') || new URL(req.url).searchParams.get('token');
  if (!got || got.length !== expected.length) return false;
  let diff = 0; for (let i = 0; i < expected.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  if (!process.env.RBC_INBOUND_TOKEN) return NextResponse.json({ ok: false, error: 'Inbound not configured — set RBC_INBOUND_TOKEN in Vercel env.' }, { status: 503 });

  let b64 = '', fileName = 'rbc-report.docx', bodyToken: string | null = null;
  const ctype = req.headers.get('content-type') ?? '';
  try {
    if (ctype.includes('application/json')) {
      const j = await req.json() as { token?: unknown; file_base64?: unknown; file_name?: unknown };
      bodyToken = typeof j.token === 'string' ? j.token : null;
      b64 = typeof j.file_base64 === 'string' ? j.file_base64.replace(/^data:[^,]+,/, '') : '';
      if (typeof j.file_name === 'string') fileName = j.file_name;
    } else {
      const form = await req.formData();
      bodyToken = (form.get('token') as string) || null;
      const file = (form.get('attachment') || form.get('file') || form.get('attachment1')) as File | null;
      if (file) { fileName = file.name || fileName; b64 = Buffer.from(await file.arrayBuffer()).toString('base64'); }
    }
  } catch { return NextResponse.json({ ok: false, error: 'Could not read request body' }, { status: 400 }); }

  if (!tokenOk(req, bodyToken)) return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
  if (!b64) return NextResponse.json({ ok: false, error: 'No report attachment found' }, { status: 400 });
  if (!/\.docx$/i.test(fileName) && !ctype.includes('json')) { /* allow; engine validates content */ }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const r = await processRbcReport(admin, { buffer: Buffer.from(b64, 'base64'), fileName, source: 'email', uploadedBy: null });
  if (!r.ok) {
    try { await admin.from('ai_writes').insert({ tool: 'rbc_inbound', caller_id: null, input: { file_name: fileName }, result: null, status: 'error', error: r.error }); } catch { /* non-fatal */ }
    return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  }
  try { await admin.from('ai_writes').insert({ tool: 'rbc_inbound', caller_id: null, input: { file_name: fileName }, result: { ...r }, status: 'success', error: null }); } catch { /* non-fatal */ }
  return NextResponse.json({ ...r, source: 'email' });
}

// Lightweight health/verify for the setup test (GET with ?token=).
export async function GET(req: NextRequest) {
  if (!process.env.RBC_INBOUND_TOKEN) return NextResponse.json({ ok: false, configured: false, error: 'Set RBC_INBOUND_TOKEN in Vercel env.' }, { status: 503 });
  if (!tokenOk(req, null)) return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
  return NextResponse.json({ ok: true, ready: true, message: 'RBC inbound endpoint is live and the token is valid.' });
}
